import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateApprovalLetterInput } from "@/lib/workflow";

// PATCH /api/approval-letter/[id] — Olur yazısı detayını günceller (revize sonrası düzenleme).
// Status'u değiştirmez. Yeniden göndermek için POST /api/requests/[id]/resubmit kullanılır.
//
// Ödenen tutarlar (paid_amounts) ayrı tabloda değil, approval_letter_requests
// üzerindeki jsonb string dizisidir; tek UPDATE ile tamamen değiştirilir.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateApprovalLetterInput> = await request.json();

    // Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // Talebi çek (eligibility + workflow tipi için)
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id, workflow_definition:workflow_definitions(code)")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // PostgREST 1:1 embed obje veya tek elemanlı dizi dönebilir — ikisini de tolere et
    const wfDef = req.workflow_definition as { code?: string } | { code?: string }[] | null;
    const workflowCode = Array.isArray(wfDef) ? wfDef[0]?.code : wfDef?.code;
    if (workflowCode !== "APPROVAL_LETTER") {
      return NextResponse.json({ error: "Bu talep bir olur yazısı değil" }, { status: 400 });
    }

    if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Validasyon (POST ile aynı)
    if (body.letter_date !== undefined && !body.letter_date) {
      return NextResponse.json({ error: "Tarih gerekli" }, { status: 400 });
    }
    if (body.company !== undefined && !body.company?.trim()) {
      return NextResponse.json({ error: "Firma gerekli" }, { status: 400 });
    }
    if (body.project !== undefined && !body.project?.trim()) {
      return NextResponse.json({ error: "Proje gerekli" }, { status: 400 });
    }
    if (body.subject !== undefined && !body.subject?.trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }
    if (body.content !== undefined && !body.content?.trim()) {
      return NextResponse.json({ error: "Yazı içeriği gerekli" }, { status: 400 });
    }
    if (
      body.paid_amounts !== undefined &&
      (!Array.isArray(body.paid_amounts) || body.paid_amounts.some((v) => typeof v !== "string"))
    ) {
      return NextResponse.json({ error: "Ödenen tutarlar geçersiz" }, { status: 400 });
    }

    // Detay tabloyu güncelle (sadece tanımlı alanlar)
    const patch: Record<string, unknown> = {};
    if (body.letter_date !== undefined) patch.letter_date = body.letter_date;
    if (body.company !== undefined) patch.company = body.company;
    if (body.project !== undefined) patch.project = body.project;
    if (body.subject !== undefined) patch.subject = body.subject;
    if (body.content !== undefined) patch.content = body.content;

    // Ödeme tablosu tek blok olarak yazılır (has_payment_table gönderildiyse):
    // POST ile aynı kural — tablo kapalıysa tüm ödeme alanları temizlenir, böylece
    // revizede "Ödeme Tablosu"nu kapatan kullanıcının eski değerleri PDF'e sızmaz.
    if (body.has_payment_table !== undefined) {
      const hasTable = Boolean(body.has_payment_table);
      patch.has_payment_table = hasTable;
      patch.comparison_approval_date = hasTable ? body.comparison_approval_date || null : null;
      patch.agreement_amount = hasTable ? body.agreement_amount || null : null;
      patch.has_contract = hasTable ? body.has_contract ?? null : null;
      patch.paid_amounts = hasTable ? body.paid_amounts || [] : [];
      patch.remaining_payment = hasTable ? body.remaining_payment || null : null;
      patch.requested_payment_amount = hasTable ? body.requested_payment_amount || null : null;
      patch.remaining_after_payment = hasTable ? body.remaining_after_payment || null : null;
    }

    // Tabloda updated_at trigger'ı yok → elle damgala
    patch.updated_at = new Date().toISOString();

    // .select() ile etkilenen satırı geri istiyoruz: RLS UPDATE'i sessizce 0 satıra
    // düşürürse (ör. statü bu arada değişti) "başarılı" dönüp eski veriyle
    // resubmit etmeyelim.
    const { data: updatedRows, error: updateError } = await supabase
      .from("approval_letter_requests")
      .update(patch)
      .eq("request_id", requestId)
      .select("id");

    if (updateError) {
      console.error("[approval-letter PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      console.error("[approval-letter PATCH] no rows updated (RLS or missing detail row):", requestId);
      return NextResponse.json({ error: "Olur yazısı güncellenemedi" }, { status: 403 });
    }

    await applyAuditStamp(
      supabase,
      requestId,
      appUser.role === "ORG_ADMIN" && req.requester_employee_id !== appUser.employee_id
        ? "EDITED_BY_ADMIN"
        : "EDITED",
      appUser.employee_id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[approval-letter PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
