import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateAccountingApprovalCoverInput } from "@/lib/workflow";
import {
  buildAccountingCoverDetail,
  buildAccountingCoverItems,
  validateAccountingCoverInput,
} from "@/lib/workflow/approval-cover-payload";

const WORKFLOW_CODE = "ACCOUNTING_APPROVAL_COVER";

// PATCH /api/accounting-approval-cover/[id] — Revize/taslak durumundaki muhasebe
// onay kapağının başlık/değerlendirme alanlarını ve ödeme satırlarını günceller
// (tam gövde, POST ile aynı validasyon). Status'u değiştirmez; yeniden göndermek için
// POST /api/requests/[id]/resubmit kullanılır. "İlgili Kişiler" (dinamik
// onaycılar) resubmit gövdesinde gönderilir, burada değil.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: CreateAccountingApprovalCoverInput = await request.json();

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

    // Talebi çek (eligibility için)
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id, workflow_definition:workflow_definitions(code)")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const code = (req as unknown as { workflow_definition?: { code?: string } }).workflow_definition?.code;
    if (code !== WORKFLOW_CODE) {
      return NextResponse.json({ error: "Talep bu form türüne ait değil" }, { status: 400 });
    }

    // Yalnız talep sahibi: ödeme satırlarının INSERT RLS'i talep sahibine bağlı.
    // ORG_ADMIN başkasının kapağını düzenlerse DELETE geçer ama INSERT (ve geri
    // yükleme) reddedilir → talep satırsız kalırdı.
    if (
      req.requester_employee_id !== appUser.employee_id ||
      !canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })
    ) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Validasyon (POST ile aynı)
    const validationError = validateAccountingCoverInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data: accountingRequest, error: detailError } = await supabase
      .from("accounting_approval_cover_requests")
      .select("id")
      .eq("request_id", requestId)
      .single();

    if (detailError || !accountingRequest) {
      console.error("[accounting-approval-cover PATCH] detail not found:", detailError);
      return NextResponse.json({ error: "Onay kapağı detayı bulunamadı" }, { status: 404 });
    }

    // Sıra: önce ödeme satırları, en son başlık — satırlar başarısız olursa başlık
    // değişmemiş kalır. Satırlar delete + reinsert ((accounting_request_id, row_order)
    // UNIQUE); insert başarısız olursa eski satırlar geri yazılır.
    const { data: oldItems, error: oldItemsError } = await supabase
      .from("accounting_approval_cover_items")
      .select("*")
      .eq("accounting_request_id", accountingRequest.id);

    if (oldItemsError) {
      console.error("[accounting-approval-cover PATCH] items read failed:", oldItemsError);
      return NextResponse.json({ error: "Failed to read items" }, { status: 500 });
    }

    const { error: delError } = await supabase
      .from("accounting_approval_cover_items")
      .delete()
      .eq("accounting_request_id", accountingRequest.id);

    if (delError) {
      console.error("[accounting-approval-cover PATCH] items delete failed:", delError);
      return NextResponse.json({ error: "Failed to clear items" }, { status: 500 });
    }

    const { error: insertError } = await supabase
      .from("accounting_approval_cover_items")
      .insert(buildAccountingCoverItems(body, accountingRequest.id));

    if (insertError) {
      console.error("[accounting-approval-cover PATCH] items insert failed:", insertError);
      if (oldItems && oldItems.length > 0) {
        const { error: restoreError } = await supabase
          .from("accounting_approval_cover_items")
          .insert(oldItems);
        if (restoreError) {
          console.error("[accounting-approval-cover PATCH] items RESTORE failed:", requestId, restoreError);
        }
      }
      return NextResponse.json({ error: "Failed to insert items" }, { status: 500 });
    }

    // Başlık (tabloda updated_at trigger'ı yok → elle damgala)
    const { error: updateError } = await supabase
      .from("accounting_approval_cover_requests")
      .update({ ...buildAccountingCoverDetail(body), updated_at: new Date().toISOString() })
      .eq("id", accountingRequest.id);

    if (updateError) {
      console.error("[accounting-approval-cover PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    await applyAuditStamp(supabase, requestId, "EDITED", appUser.employee_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[accounting-approval-cover PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
