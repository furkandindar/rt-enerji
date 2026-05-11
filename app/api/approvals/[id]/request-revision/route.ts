import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  applyAuditStamp,
  canRequestRevision,
  notifyRevisionRequested,
} from "@/lib/workflow";

// POST /api/approvals/[id]/request-revision
// Onaycı, sırası gelmiş PENDING onay kaydında "revize iste" der.
// Body: { comment: string } — zorunlu.
//
// Etki:
//   - request_approvals[id].status = 'REVISION_REQUESTED', comment, decided_at = now
//   - requests.status = 'REVISION_REQUESTED', current_step = 1
//   - Talep edene REVISION_REQUESTED bildirimi (comment ile)
//
// NOT: Onay zinciri burada SIFIRLANMAZ; resubmit anında sıfırlanır.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: approvalId } = await params;
    const body = (await request.json().catch(() => ({}))) as { comment?: string };

    const comment = (body.comment ?? "").trim();
    if (!comment) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role, employee:employees(first_name, last_name)")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    const requesterByEmp = (appUser as unknown as { employee?: { first_name?: string; last_name?: string } }).employee;
    const requestedByName = requesterByEmp
      ? `${requesterByEmp.first_name || ""} ${requesterByEmp.last_name || ""}`.trim()
      : "";

    // 2. Approval + request yükle
    const { data: approval, error: approvalError } = await supabase
      .from("request_approvals")
      .select(`
        id,
        status,
        sequence_order,
        approver_employee_id,
        request_id,
        request:requests(
          id,
          status,
          current_step,
          requester_employee_id,
          workflow_definition:workflow_definitions(name)
        )
      `)
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const req = (approval as unknown as { request?: { id: string; status: string; current_step: number; requester_employee_id: string; workflow_definition?: { name?: string } } }).request;
    if (!req) {
      return NextResponse.json({ error: "Linked request not found" }, { status: 404 });
    }

    // 3. Eligibility
    const ok = canRequestRevision(
      {
        status: approval.status,
        sequence_order: approval.sequence_order,
        approver_employee_id: approval.approver_employee_id,
      },
      { status: req.status as "PENDING", current_step: req.current_step },
      { employeeId: appUser.employee_id, role: appUser.role }
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Cannot request revision: state mismatch or not your turn" },
        { status: 409 }
      );
    }

    // 4. Approval kaydını REVISION_REQUESTED'a çek
    const now = new Date().toISOString();
    const { error: aUpdateError } = await supabase
      .from("request_approvals")
      .update({
        status: "REVISION_REQUESTED",
        comment,
        decided_at: now,
      })
      .eq("id", approvalId)
      .eq("status", "PENDING") // race-safe
      .eq("approver_employee_id", appUser.employee_id);

    if (aUpdateError) {
      console.error("[request-revision] approval update failed:", aUpdateError);
      return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
    }

    // 5. Request status'unu REVISION_REQUESTED'a, current_step=1
    const { error: rUpdateError } = await supabase
      .from("requests")
      .update({
        status: "REVISION_REQUESTED",
        current_step: 1,
      })
      .eq("id", req.id);

    if (rUpdateError) {
      console.error("[request-revision] request update failed:", rUpdateError);
      return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
    }

    // 6. Audit
    await applyAuditStamp(supabase, req.id, "REVISION_REQUESTED", appUser.employee_id);

    // 7. Bildirim: talep edene REVISION_REQUESTED
    try {
      const workflowName = req.workflow_definition?.name ?? "Talep";
      await notifyRevisionRequested(
        supabase,
        req.requester_employee_id,
        req.id,
        workflowName,
        requestedByName,
        comment
      );
    } catch (notifErr) {
      console.error("[request-revision] notification dispatch failed:", notifErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[request-revision] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
