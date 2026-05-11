import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateRequestFormInput } from "@/lib/workflow";

// PATCH /api/request-form/[id] — Talep formu detayını günceller.
// Status'u değiştirmez. Yeniden göndermek için POST /api/requests/[id]/resubmit kullanılır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateRequestFormInput> = await request.json();

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
      .select("id, status, requester_employee_id")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Validasyon (POST ile aynı)
    if (body.requester_name !== undefined && !body.requester_name.trim()) {
      return NextResponse.json({ error: "Talep eden adı soyadı gerekli" }, { status: 400 });
    }
    if (body.company !== undefined && !body.company.trim()) {
      return NextResponse.json({ error: "Şirket adı gerekli" }, { status: 400 });
    }
    if (body.subject !== undefined && !body.subject.trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }
    if (body.content !== undefined && !body.content.trim()) {
      return NextResponse.json({ error: "Talep içeriği gerekli" }, { status: 400 });
    }
    if (body.request_type !== undefined && !["MUTFAK", "KIRTASIYE", "DIGER"].includes(body.request_type)) {
      return NextResponse.json({ error: "Geçerli bir talep türü seçin" }, { status: 400 });
    }

    // Detay tabloyu güncelle (sadece tanımlı alanlar)
    const patch: Record<string, unknown> = {};
    if (body.requester_name !== undefined) patch.requester_name = body.requester_name;
    if (body.company !== undefined) patch.company = body.company;
    if (body.request_date !== undefined) patch.request_date = body.request_date;
    if (body.subject !== undefined) patch.subject = body.subject;
    if (body.content !== undefined) patch.content = body.content;
    if (body.quantity !== undefined) patch.quantity = body.quantity || null;
    if (body.amount !== undefined) patch.amount = body.amount ?? null;
    if (body.reason !== undefined) patch.reason = body.reason || null;
    if (body.request_type !== undefined) patch.request_type = body.request_type;

    const { error: updateError } = await supabase
      .from("request_form_requests")
      .update(patch)
      .eq("request_id", requestId);

    if (updateError) {
      console.error("[request-form PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
    console.error("[request-form PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
