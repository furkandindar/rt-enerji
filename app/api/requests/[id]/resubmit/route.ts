import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  applyAuditStamp,
  notifyApprover,
  notifyRequestUpdated,
  resetApprovalChain,
  type CreateRequestDynamicApprovers,
} from "@/lib/workflow";

// POST /api/requests/[id]/resubmit
// DRAFT veya REVISION_REQUESTED durumdaki bir talebi yeniden gönderir:
//   - revision_cycle artırılır
//   - createApprovalChain yeni cycle ile çağrılır (yeni PENDING kayıtlar)
//   - status PENDING'e döner, submitted_at = now()
//   - Eski cycle'da APPROVED veren onaycılara REQUEST_UPDATED bildirimi
//   - Yeni 1. onaycıya APPROVAL_REQUIRED bildirimi
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

    // Body — opsiyonel: dynamicApprovers, formData
    let body: { dynamicApprovers?: CreateRequestDynamicApprovers; formData?: Record<string, unknown> } = {};
    try {
      body = await request.json();
    } catch {
      // body boş olabilir
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

    const updaterEmp = (appUser as unknown as { employee?: { first_name?: string; last_name?: string } }).employee;
    const updaterName = updaterEmp
      ? `${updaterEmp.first_name || ""} ${updaterEmp.last_name || ""}`.trim()
      : "";

    // 2. Talebi getir
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select(`
        id,
        status,
        requester_employee_id,
        current_revision_cycle,
        workflow_definition:workflow_definitions(name)
      `)
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 3. Eligibility: status ∈ (DRAFT, REVISION_REQUESTED) ve (requester veya ORG_ADMIN)
    if (req.status !== "DRAFT" && req.status !== "REVISION_REQUESTED") {
      return NextResponse.json(
        { error: `Cannot resubmit from status ${req.status}` },
        { status: 409 }
      );
    }

    const isRequester = req.requester_employee_id === appUser.employee_id;
    if (!isRequester && appUser.role !== "ORG_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const previousCycle = req.current_revision_cycle ?? 0;
    const workflowName =
      (req as unknown as { workflow_definition?: { name?: string } }).workflow_definition?.name ?? "Talep";

    // 4. Eğer dynamicApprovers gelmediyse, eski cycle'dan map'leyelim
    //    (önceki turda DYNAMIC_USER_LIST adımları için kullanılan kişiler)
    let effectiveDynamic = body.dynamicApprovers;
    if (!effectiveDynamic) {
      const { data: prevApprovals } = await supabase
        .from("request_approvals")
        .select("workflow_step_id, approver_employee_id, sequence_order, workflow_step:workflow_steps(approver_type)")
        .eq("request_id", requestId)
        .eq("revision_cycle", previousCycle)
        .order("sequence_order", { ascending: true });

      const dynamicMap: CreateRequestDynamicApprovers = {};
      for (const a of prevApprovals ?? []) {
        const stepType = (a as unknown as { workflow_step?: { approver_type?: string } }).workflow_step?.approver_type;
        if (stepType === "DYNAMIC_USER_LIST" && a.workflow_step_id && a.approver_employee_id) {
          (dynamicMap[a.workflow_step_id] ||= []).push(a.approver_employee_id);
        }
      }
      effectiveDynamic = Object.keys(dynamicMap).length > 0 ? dynamicMap : undefined;
    }

    // 5. Eski cycle'da APPROVED veren onaycıları topla (notification için, reset'ten ÖNCE)
    const { data: prevApproved } = await supabase
      .from("request_approvals")
      .select("approver_employee_id")
      .eq("request_id", requestId)
      .eq("revision_cycle", previousCycle)
      .eq("status", "APPROVED");

    const previouslyApprovedSet = new Set<string>();
    for (const row of prevApproved ?? []) {
      if (row.approver_employee_id && row.approver_employee_id !== req.requester_employee_id) {
        previouslyApprovedSet.add(row.approver_employee_id);
      }
    }

    // 6. Approval chain'i sıfırla (service role içeride; cycle bump dahil)
    let newCycle: number;
    try {
      const result = await resetApprovalChain(requestId, body.formData, effectiveDynamic);
      newCycle = result.newCycle;
    } catch (err) {
      console.error("[resubmit] resetApprovalChain failed:", err);
      return NextResponse.json({ error: "Failed to reset approval chain" }, { status: 500 });
    }

    // 7. status'u yeniden değerlendir
    //    createApprovalChain "tüm adımlar auto-approved" senaryosunda zaten APPROVED yapmış olabilir.
    //    Aksi halde PENDING'e çekip submitted_at = now() yapıyoruz.
    const { data: refreshed } = await supabase
      .from("requests")
      .select("status")
      .eq("id", requestId)
      .single();

    if (refreshed?.status !== "APPROVED" && refreshed?.status !== "COMPLETED") {
      const { error: updateError } = await supabase
        .from("requests")
        .update({
          status: "PENDING",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("[resubmit] status update failed:", updateError);
      }
    }

    // 8. Audit stamp
    await applyAuditStamp(supabase, requestId, "RESUBMITTED", appUser.employee_id);

    // 9. Bildirimler
    try {
      // 9a. Yeni cycle'ın ilk PENDING onaycısına APPROVAL_REQUIRED
      const { data: nextPending } = await supabase
        .from("request_approvals")
        .select("approver_employee_id, sequence_order")
        .eq("request_id", requestId)
        .eq("revision_cycle", newCycle)
        .eq("status", "PENDING")
        .order("sequence_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextPending?.approver_employee_id) {
        await notifyApprover(
          supabase,
          nextPending.approver_employee_id,
          updaterName,
          requestId,
          workflowName
        );
      }

      // 9b. Eski cycle'da APPROVED veren onaycılara REQUEST_UPDATED
      for (const employeeId of previouslyApprovedSet) {
        await notifyRequestUpdated(
          supabase,
          employeeId,
          requestId,
          workflowName,
          updaterName
        );
      }
    } catch (notifErr) {
      console.error("[resubmit] notification dispatch failed:", notifErr);
    }

    return NextResponse.json({ success: true, newCycle });
  } catch (err) {
    console.error("[resubmit] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
