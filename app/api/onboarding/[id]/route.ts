import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateOnboardingInput } from "@/lib/workflow";

const WORKFLOW_CODE = "EMPLOYEE_ONBOARDING";

// Talep edenin 1. adımda (section 1) doldurduğu alanlar — POST ile aynı küme.
// Sonraki FILL_AND_SIGN adımlarının checklist kolonları (*_status / *_notes)
// bilinçli olarak dışarıda: onları onaycılar approvals route'u üzerinden yazar.
const SECTION_1_KEYS: (keyof CreateOnboardingInput)[] = [
  "employee_name",
  "employee_title",
  "department",
  "location",
  "job_description",
  "reporting_manager",
  "start_date",
  "employment_period",
];

// PATCH /api/onboarding/[id] — İşe giriş takip formunun temel (section 1) alanlarını günceller.
// Status'u değiştirmez. Yeniden göndermek için POST /api/requests/[id]/resubmit kullanılır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateOnboardingInput> = await request.json();

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

    // Talebi çek (eligibility + workflow kontrolü için)
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id, workflow_definition:workflow_definitions(code)")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const workflowCode =
      (req as { workflow_definition?: { code?: string } | null }).workflow_definition?.code ?? null;
    if (workflowCode !== WORKFLOW_CODE) {
      return NextResponse.json({ error: "Bu talep bir işe giriş takip formu değil" }, { status: 400 });
    }

    if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Validasyon (POST ile aynı)
    if (body.employee_name !== undefined && !body.employee_name?.trim()) {
      return NextResponse.json({ error: "İşe başlayacak kişinin adı zorunludur" }, { status: 400 });
    }
    if (body.start_date !== undefined && !body.start_date) {
      return NextResponse.json({ error: "İşe giriş tarihi zorunludur" }, { status: 400 });
    }

    // Detay tabloyu güncelle (sadece section 1 alanlarından gönderilenler)
    const patch: Record<string, unknown> = {};
    for (const key of SECTION_1_KEYS) {
      const value = body[key];
      if (value !== undefined) patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Güncellenecek alan yok" }, { status: 400 });
    }
    // Tabloda updated_at trigger'ı yok; approvals route'u gibi elle set ediyoruz.
    patch.updated_at = new Date().toISOString();

    // .select() ile etkilenen satırı geri alıyoruz: RLS UPDATE'i sessizce 0 satıra
    // düşürürse (ör. onboarding_requests_update policy'si ORG_ADMIN'i kapsamıyor)
    // hata dönmez — başarılı gibi görünmesin diye kontrol ediyoruz.
    const { data: updatedRows, error: updateError } = await supabase
      .from("onboarding_requests")
      .update(patch)
      .eq("request_id", requestId)
      .select("request_id");

    if (updateError) {
      console.error("[onboarding PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      console.error("[onboarding PATCH] no rows updated (RLS or missing detail row):", requestId);
      return NextResponse.json(
        { error: "Form detayı güncellenemedi (kayıt bulunamadı veya yetki yok)" },
        { status: 403 }
      );
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
    console.error("[onboarding PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
