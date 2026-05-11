import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateSeparationInput } from "@/lib/workflow";

// PATCH /api/separation/[id] — Ayrılma talebi temel alanlarını günceller.
// NOT: Onaycıların doldurduğu checklist alanları bu endpoint'le değiştirilmez.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateSeparationInput> = await request.json();

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

    const patch: Record<string, unknown> = {};
    const allowedKeys: (keyof CreateSeparationInput)[] = [
      "employee_name",
      "employee_title",
      "department",
      "location",
      "job_description",
      "reporting_manager",
      "separation_date",
      "separation_reason",
      "employment_period",
      "annual_leave_days",
      "annual_leave_amount",
      "severance_days",
      "severance_amount",
      "notice_weeks",
      "notice_amount",
    ];
    for (const key of allowedKeys) {
      const value = body[key];
      if (value !== undefined) patch[key] = value;
    }

    const { error: updateError } = await supabase
      .from("separation_requests")
      .update(patch)
      .eq("request_id", requestId);

    if (updateError) {
      console.error("[separation PATCH] update failed:", updateError);
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
    console.error("[separation PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
