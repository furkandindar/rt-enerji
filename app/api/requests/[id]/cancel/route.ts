import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canCancelRequest, createNotification } from "@/lib/workflow";

// POST /api/requests/[id]/cancel
// Talep eden veya ORG_ADMIN talebi CANCELLED'a çeker (soft cancel, hard delete yok).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // 2. Talebi getir
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select(`
        id,
        status,
        requester_employee_id,
        workflow_definition_id,
        current_revision_cycle,
        workflow_definition:workflow_definitions(name)
      `)
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 3. Eligibility
    const ok = canCancelRequest(
      { status: req.status, requester_employee_id: req.requester_employee_id },
      { employeeId: appUser.employee_id, role: appUser.role }
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Cannot cancel: terminal state or unauthorized" },
        { status: 409 }
      );
    }

    // 4. Status'u CANCELLED'a çek
    const { error: updateError } = await supabase
      .from("requests")
      .update({
        status: "CANCELLED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      console.error("[cancel] update failed:", updateError);
      return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
    }

    // 5. Audit
    await applyAuditStamp(supabase, requestId, "CANCELLED", appUser.employee_id);

    // 6. Daha önce APPROVED veren onaycılara "talep iptal edildi" bildirimi
    //    (aktif cycle'da APPROVED olanlar — distinct, talep edeni hariç tut)
    try {
      const workflowName =
        (req as unknown as { workflow_definition?: { name?: string } }).workflow_definition?.name ?? "Talep";
      const activeCycle = req.current_revision_cycle ?? 0;
      const { data: approvedRows } = await supabase
        .from("request_approvals")
        .select("approver_employee_id")
        .eq("request_id", requestId)
        .eq("revision_cycle", activeCycle)
        .eq("status", "APPROVED");

      const recipients = new Set<string>();
      for (const row of approvedRows ?? []) {
        if (row.approver_employee_id && row.approver_employee_id !== req.requester_employee_id) {
          recipients.add(row.approver_employee_id);
        }
      }

      for (const employeeId of recipients) {
        // employeeId → app_users.id eşlemesi
        const { data: targetUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("employee_id", employeeId)
          .single();
        if (!targetUser) continue;

        await createNotification(supabase, {
          userId: targetUser.id,
          title: "Talep İptal Edildi",
          message: `Önceden onayladığınız ${workflowName} talebi iptal edildi.`,
          type: "REQUEST_CANCELLED",
          referenceId: requestId,
        });
      }
    } catch (notifErr) {
      console.error("[cancel] notification dispatch failed:", notifErr);
    }

    return NextResponse.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    console.error("[cancel] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
