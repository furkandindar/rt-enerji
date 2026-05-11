import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateSalaryAdvanceInput } from "@/lib/workflow";

// PATCH /api/salary-advance/[id] — Avans talebi detayını günceller.
// NOT: salary_deduction_consent alanı talep eden tarafından değiştirilemez (HR onaycısı setler).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateSalaryAdvanceInput> = await request.json();

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

    if (body.amount !== undefined && (!Number.isFinite(body.amount) || body.amount <= 0)) {
      return NextResponse.json({ error: "Geçerli bir tutar girin" }, { status: 400 });
    }
    if (body.payment_method !== undefined && !["CASH", "BANK_TRANSFER"].includes(body.payment_method)) {
      return NextResponse.json({ error: "Geçerli bir ödeme yöntemi seçin" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.amount !== undefined) patch.amount = body.amount;
    if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
    // salary_deduction_consent kasıtlı olarak dışarıda

    const { error: updateError } = await supabase
      .from("salary_advance_requests")
      .update(patch)
      .eq("request_id", requestId);

    if (updateError) {
      console.error("[salary-advance PATCH] update failed:", updateError);
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
    console.error("[salary-advance PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
