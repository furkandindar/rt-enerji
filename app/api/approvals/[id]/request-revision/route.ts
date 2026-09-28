import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  applyAuditStamp,
  canRequestRevision,
  notifyRevisionRequested,
} from "@/lib/workflow";
import {
  resolveActingRights,
  getEmployeeFullName,
  formatActingName,
} from "@/lib/workflow/delegation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  deleteExtraApproverRecords,
  getEmployeeNamesInOrder,
  recordRevisionExtraApprovers,
  validateManagerExtraApprovers,
} from "@/lib/workflow/extra-approvers";

// POST /api/approvals/[id]/request-revision
// Onaycı, sırası gelmiş PENDING onay kaydında "revize iste" der.
// Body: { comment: string (zorunlu), extraApproverIds?: string[] }
//
// Etki:
//   - request_approvals[id].status = 'REVISION_REQUESTED', comment, decided_at = now
//   - requests.status = 'REVISION_REQUESTED', current_step = 1
//   - Talep edene REVISION_REQUESTED bildirimi (comment ile)
//   - extraApproverIds (yalnız can_add_extra_approvers adımında — Olur/GM): kişiler
//     request_extra_approvers'a kilitli olarak yazılır; talep sahibi yeniden
//     gönderince resubmit yeni turda onları yöneticinin hemen önüne ekler.
//
// NOT: Onay zinciri burada SIFIRLANMAZ; resubmit anında sıfırlanır.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: approvalId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      comment?: string;
      extraApproverIds?: unknown;
    };

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
        revision_cycle,
        approver_employee_id,
        request_id,
        workflow_step:workflow_steps(*),
        request:requests(
          id,
          status,
          current_step,
          current_revision_cycle,
          requester_employee_id,
          workflow_definition_id,
          workflow_definition:workflow_definitions(name)
        )
      `)
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const req = (approval as unknown as {
      request?: {
        id: string;
        status: string;
        current_step: number;
        current_revision_cycle: number | null;
        requester_employee_id: string;
        workflow_definition_id: string;
        workflow_definition?: { name?: string };
      };
    }).request;
    if (!req) {
      return NextResponse.json({ error: "Linked request not found" }, { status: 404 });
    }

    // Vekalet (B2): işlem yetkisi DB'den (kendisi VEYA aktif vekil)
    const acting = await resolveActingRights(
      supabase,
      approvalId,
      approval.approver_employee_id,
      appUser.employee_id
    );

    // 3. Eligibility
    const ok = canRequestRevision(
      {
        status: approval.status,
        sequence_order: approval.sequence_order,
        approver_employee_id: approval.approver_employee_id,
      },
      { status: req.status as "PENDING", current_step: req.current_step },
      { employeeId: appUser.employee_id, role: appUser.role },
      acting
    );

    // Eski revize turunun PENDING satırı (denetim için duruyor) sequence'i tesadüfen
    // current_step'e eşit olabilir → yalnız aktif turun satırında revize istenebilir.
    const isActiveCycle = (approval.revision_cycle ?? 0) === (req.current_revision_cycle ?? 0);

    if (!ok || !isActiveCycle) {
      return NextResponse.json(
        { error: "Cannot request revision: state mismatch or not your turn" },
        { status: 409 }
      );
    }

    // 3b. Ek onaycılar (opsiyonel; boş liste = ekleme yok). Tüm doğrulama ilk
    //     yazmadan önce. Kilitli kayıt service role ile yazılır (tabloda yazma
    //     policy'si yok), revize kaydı yazılamazsa geri alınır.
    if (body.extraApproverIds !== undefined && !Array.isArray(body.extraApproverIds)) {
      return NextResponse.json({ error: "Geçersiz kişi listesi" }, { status: 400 });
    }
    const wantsExtraApprovers =
      Array.isArray(body.extraApproverIds) && body.extraApproverIds.length > 0;
    // Ek onaycı yoksa service role hiç kurulmaz — standart revize akışı aynen kalır.
    const admin = wantsExtraApprovers ? createServiceRoleClient() : null;
    let extraApproverIds: string[] = [];
    let extraApproverNames: string[] = [];
    let recordedExtraIds: string[] = [];

    if (admin) {
      const step = (approval as unknown as { workflow_step?: { id?: string } | null }).workflow_step;
      const check = await validateManagerExtraApprovers(admin, {
        requestId: req.id,
        workflowDefinitionId: req.workflow_definition_id,
        managerStepId: step?.id ?? "",
        requesterEmployeeId: req.requester_employee_id,
        actorEmployeeId: appUser.employee_id,
        cycle: req.current_revision_cycle ?? 0,
        rawIds: body.extraApproverIds,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: check.status });
      }
      extraApproverIds = check.employeeIds;
      extraApproverNames = await getEmployeeNamesInOrder(admin, extraApproverIds);

      try {
        recordedExtraIds = await recordRevisionExtraApprovers(admin, {
          requestId: req.id,
          dynamicStepId: check.target.dynamicStepId,
          employeeIds: extraApproverIds,
          addedByEmployeeId: appUser.employee_id,
          cycle: req.current_revision_cycle ?? 0,
          note: comment,
        });
      } catch (recordErr) {
        console.error("[request-revision] extra approver record failed:", recordErr);
        return NextResponse.json({ error: "Ek onaycılar kaydedilemedi" }, { status: 500 });
      }
    }

    // 4. Approval kaydını REVISION_REQUESTED'a çek
    const now = new Date().toISOString();
    const { data: updatedApprovalRows, error: aUpdateError } = await supabase
      .from("request_approvals")
      .update({
        status: "REVISION_REQUESTED",
        comment,
        decided_at: now,
        acted_by_employee_id: acting.isDelegate ? appUser.employee_id : null, // Vekalet (B2)
      })
      .eq("id", approvalId)
      .eq("status", "PENDING") // race-safe; onaycı/vekil kısıtı RLS update politikasında
      .select("id");

    if (aUpdateError || !updatedApprovalRows || updatedApprovalRows.length === 0) {
      // Kilitli ek onaycı kaydı yazıldıysa geri al — revize olmadıysa sonraki bir
      // resubmit'te yetim kayıt zincire girmesin.
      if (admin) await deleteExtraApproverRecords(admin, recordedExtraIds);
      if (aUpdateError) {
        console.error("[request-revision] approval update failed:", aUpdateError);
        return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
      }
      // 0 satır: bu arada karar verilmiş (çift tık / eşzamanlı işlem)
      return NextResponse.json(
        { error: "Cannot request revision: approval already processed" },
        { status: 409 }
      );
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
        acting.isDelegate && acting.onBehalfOfEmployeeId
          ? formatActingName(
              requestedByName || "Onaycı",
              await getEmployeeFullName(supabase, acting.onBehalfOfEmployeeId)
            )
          : requestedByName,
        comment,
        undefined,
        extraApproverNames
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
