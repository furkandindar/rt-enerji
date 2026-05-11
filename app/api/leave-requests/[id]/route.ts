import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";

interface PatchLeaveBody {
  leave_type?: "ANNUAL_LEAVE" | "SHORT_LEAVE";
  start_datetime?: string;
  end_datetime?: string;
  total_days?: number;
  address_during_leave?: string | null;
  reason?: string | null;
  overtime_amount?: number | null;
}

// PATCH /api/leave-requests/[id] — İzin talebi detayını günceller.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: PatchLeaveBody = await request.json();

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
    if (body.leave_type !== undefined) patch.leave_type = body.leave_type;
    if (body.start_datetime !== undefined) patch.start_datetime = body.start_datetime;
    if (body.end_datetime !== undefined) patch.end_datetime = body.end_datetime;
    if (body.total_days !== undefined) patch.total_days = body.total_days;
    if (body.address_during_leave !== undefined) patch.address_during_leave = body.address_during_leave || null;
    if (body.reason !== undefined) patch.reason = body.reason || null;
    if (body.overtime_amount !== undefined) patch.overtime_amount = body.overtime_amount ?? null;

    const { error: updateError } = await supabase
      .from("leave_requests")
      .update(patch)
      .eq("request_id", requestId);

    if (updateError) {
      console.error("[leave-requests PATCH] update failed:", updateError);
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
    console.error("[leave-requests PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
