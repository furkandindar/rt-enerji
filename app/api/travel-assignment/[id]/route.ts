import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateTravelAssignmentInput } from "@/lib/workflow";

// PATCH /api/travel-assignment/[id] — Seyahat görevi temel alanlarını günceller.
// NOT: actual_departure_at / actual_return_at alanları (COMPLETION fazı, asistan doldurur)
//      bu endpoint'le değiştirilmez.
// NOT: advance_requested değişimi koşullu adımları etkiler — resubmit anında yeni cycle
//      ile chain yeniden çalıştırılır, doğru adımlar üretilir.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateTravelAssignmentInput> = await request.json();

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
    if (body.company_id !== undefined) patch.company_id = body.company_id;
    if (body.assignment_subject !== undefined) patch.assignment_subject = body.assignment_subject;
    if (body.destination_city !== undefined) patch.destination_city = body.destination_city;
    if (body.destination_institution !== undefined) patch.destination_institution = body.destination_institution;
    if (body.estimated_departure_at !== undefined) patch.estimated_departure_at = body.estimated_departure_at;
    if (body.estimated_return_at !== undefined) patch.estimated_return_at = body.estimated_return_at;
    if (body.transportation_type !== undefined) patch.transportation_type = body.transportation_type;
    if (body.transportation_cost !== undefined) patch.transportation_cost = body.transportation_cost || 0;
    if (body.accommodation_needed !== undefined) patch.accommodation_needed = body.accommodation_needed;
    if (body.accommodation_cost !== undefined) patch.accommodation_cost = body.accommodation_cost || 0;
    if (body.advance_requested !== undefined) patch.advance_requested = body.advance_requested;

    const { error: updateError } = await supabase
      .from("travel_assignment_requests")
      .update(patch)
      .eq("request_id", requestId);

    if (updateError) {
      console.error("[travel-assignment PATCH] update failed:", updateError);
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
    console.error("[travel-assignment PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
