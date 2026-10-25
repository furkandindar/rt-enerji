import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  applyAuditStamp,
  canRequestRevision,
  notifyRevisionRequested,
  rewindApprovalChain,
  RevisionRewindError,
} from "@/lib/workflow";
import {
  notifyRevisionAssigned,
  notifyRequesterRevisionAssigned,
} from "@/lib/workflow/notification-service";
import {
  getRevisionTargetCandidates,
  isRequesterSubmissionRow,
  parseRevisionReturnMode,
} from "@/lib/workflow/revision-target";
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
import { mentionContextLabel, parseMentionIds } from "@/lib/workflow/mentions-shared";
import { scheduleMentions } from "@/lib/workflow/mentions";

// POST /api/approvals/[id]/request-revision
// Onaycı, sırası gelmiş PENDING onay kaydında "revize iste" der.
// Body: {
//   comment: string (zorunlu),
//   revisionTargetApprovalId?: string | null — revize sorumlusu (aktif turdaki onay satırı);
//                               yok/null = talep sahibi (bugünkü akış)
//   revisionReturnMode?: 'RESTART_FROM_TARGET' | 'RETURN_TO_REVIEWER' (varsayılan RESTART_FROM_TARGET)
//   extraApproverIds?: string[] (yalnız talep sahibine revizede), mentionedEmployeeIds?: string[]
// }
//
// Etki (her durumda):
//   - request_approvals[id].status = 'REVISION_REQUESTED', comment, decided_at = now,
//     revision_target_approval_id, revision_return_mode
//
// Sorumlu = talep sahibi:
//   - requests.status = 'REVISION_REQUESTED', current_step = 1
//   - Talep edene REVISION_REQUESTED bildirimi (comment ile)
//   - extraApproverIds (yalnız can_add_extra_approvers adımında — Olur/GM): kişiler
//     request_extra_approvers'a kilitli olarak yazılır; talep sahibi yeniden
//     gönderince resubmit yeni turda onları yöneticinin hemen önüne ekler.
//   - Zincir burada SIFIRLANMAZ; resubmit anında kurulur (RETURN_TO_REVIEWER'da
//     önceki onaylar taşınır, talep doğrudan revizeyi isteyene döner).
//
// Sorumlu = ara adım (lib/workflow/revision-target.ts):
//   - Hemen yeni tur açılır (rewindApprovalChain): sorumludan önceki onaylar taşınır,
//     sorumlunun satırı PENDING; talep PENDING kalır, current_step = sorumlunun sırası.
//   - Sorumluya (ve vekiline) "düzeltmeniz bekleniyor", talep sahibine bilgi bildirimi.
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
      mentionedEmployeeIds?: unknown;
      revisionTargetApprovalId?: unknown;
      revisionReturnMode?: unknown;
    };

    const comment = (body.comment ?? "").trim();
    if (!comment) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    const returnMode = parseRevisionReturnMode(body.revisionReturnMode);
    if (!returnMode) {
      return NextResponse.json({ error: "Geçersiz düzeltme sonrası akış" }, { status: 400 });
    }
    if (
      body.revisionTargetApprovalId !== undefined &&
      body.revisionTargetApprovalId !== null &&
      typeof body.revisionTargetApprovalId !== "string"
    ) {
      return NextResponse.json({ error: "Geçersiz revize sorumlusu" }, { status: 400 });
    }
    const requestedTargetId = (body.revisionTargetApprovalId as string | null | undefined) || null;

    // @mention: biçim burada, uygunluk anma işlenirken doğrulanır
    const mentionParse = parseMentionIds(body.mentionedEmployeeIds);
    if (!mentionParse.ok) {
      return NextResponse.json({ error: mentionParse.error }, { status: 400 });
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

    // 3a. Revize sorumlusu. Aday listesi pencereyle aynı kuraldan (revision-target.ts);
    //     zincirin tamamı service role ile okunur (kısıtlı süreçlerde RLS onaycıya
    //     yalnız kendi satırını gösterir). Talep sahibinin gönderim satırı seçildiyse
    //     "talep sahibi" seçeneğiyle aynıdır.
    let target: {
      id: string;
      sequence_order: number;
      approver_employee_id: string;
      stepName: string;
      approverName: string;
    } | null = null;
    if (requestedTargetId) {
      const { data: chainRows, error: chainError } = await createServiceRoleClient()
        .from("request_approvals")
        .select(`
          id,
          status,
          sequence_order,
          approver_employee_id,
          workflow_step:workflow_steps(name, approver_type, phase),
          approver:employees!approver_employee_id(first_name, last_name)
        `)
        .eq("request_id", req.id)
        .eq("revision_cycle", req.current_revision_cycle ?? 0);
      if (chainError || !chainRows) {
        console.error("[request-revision] chain load failed:", chainError);
        return NextResponse.json({ error: "Onay zinciri okunamadı" }, { status: 500 });
      }
      type ChainRow = {
        id: string;
        status: string;
        sequence_order: number;
        approver_employee_id: string;
        workflow_step: { name?: string; approver_type?: string; phase?: string } | null;
        approver: { first_name?: string; last_name?: string } | null;
      };
      const rows = chainRows as unknown as ChainRow[];
      const chosen = rows.find((r) => r.id === requestedTargetId);
      if (!chosen) {
        return NextResponse.json({ error: "Geçersiz revize sorumlusu" }, { status: 400 });
      }
      if (!isRequesterSubmissionRow(chosen)) {
        const candidates = getRevisionTargetCandidates(rows, {
          sequence_order: approval.sequence_order,
          approver_employee_id: approval.approver_employee_id,
        });
        if (!candidates.some((c) => c.id === chosen.id)) {
          return NextResponse.json({ error: "Geçersiz revize sorumlusu" }, { status: 400 });
        }
        target = {
          id: chosen.id,
          sequence_order: chosen.sequence_order,
          approver_employee_id: chosen.approver_employee_id,
          stepName: chosen.workflow_step?.name ?? "",
          approverName: `${chosen.approver?.first_name ?? ""} ${chosen.approver?.last_name ?? ""}`.trim(),
        };
      }
    }

    // 3b. Ek onaycılar (opsiyonel; boş liste = ekleme yok). Tüm doğrulama ilk
    //     yazmadan önce. Kilitli kayıt service role ile yazılır (tabloda yazma
    //     policy'si yok), revize kaydı yazılamazsa geri alınır.
    if (body.extraApproverIds !== undefined && !Array.isArray(body.extraApproverIds)) {
      return NextResponse.json({ error: "Geçersiz kişi listesi" }, { status: 400 });
    }
    const wantsExtraApprovers =
      Array.isArray(body.extraApproverIds) && body.extraApproverIds.length > 0;
    // Kilitli ek onaycılar talep sahibinin yeniden gönderiminde zincire girer —
    // ara adıma revizede yeniden gönderim olmadığından birlikte kullanılamaz.
    if (wantsExtraApprovers && target) {
      return NextResponse.json(
        { error: "Ek onaycılar yalnız talep sahibine gönderilen revizede eklenebilir" },
        { status: 400 }
      );
    }
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
        revision_target_approval_id: target?.id ?? null,
        revision_return_mode: returnMode,
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

    // 5. Talebi sorumluya yönlendir
    if (target) {
      // 5b. Ara adım: yeni tur hemen açılır. Başarısızsa revize kararı geri alınır
      //     (satır PENDING'e döner) — talep eski turda, karar verilmemiş hâlde kalır.
      try {
        await rewindApprovalChain(req.id, {
          targetApprovalId: target.id,
          mode: returnMode,
          expectedCycle: req.current_revision_cycle ?? 0,
        });
      } catch (rewindErr) {
        console.error("[request-revision] rewind failed:", rewindErr);
        const { error: revertError } = await createServiceRoleClient()
          .from("request_approvals")
          .update({
            status: "PENDING",
            comment: null,
            decided_at: null,
            acted_by_employee_id: null,
            revision_target_approval_id: null,
            revision_return_mode: null,
          })
          .eq("id", approvalId)
          .eq("status", "REVISION_REQUESTED");
        if (revertError) {
          console.error("[request-revision] revert after failed rewind failed:", revertError);
        }
        const stateChanged = rewindErr instanceof RevisionRewindError && rewindErr.code !== "WRITE_FAILED";
        return NextResponse.json(
          { error: stateChanged ? "Talep bu arada değişti, lütfen sayfayı yenileyin" : "Revize sorumlusuna gönderilemedi" },
          { status: stateChanged ? 409 : 500 }
        );
      }
    } else {
      // 5a. Talep sahibi: status REVISION_REQUESTED, current_step=1 (zincir resubmit'te kurulur)
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
    }

    // 6. Audit
    await applyAuditStamp(supabase, req.id, "REVISION_REQUESTED", appUser.employee_id);

    // 7. Bildirimler
    const workflowName = req.workflow_definition?.name ?? "Talep";
    let actorName = requestedByName;
    const alreadyNotified = [req.requester_employee_id];
    try {
      if (acting.isDelegate && acting.onBehalfOfEmployeeId) {
        actorName = formatActingName(
          requestedByName || "Onaycı",
          await getEmployeeFullName(supabase, acting.onBehalfOfEmployeeId)
        );
      }
      // Düzeltme sonrası talebin döneceği kişi: satırın sahibi (vekaleten istendiyse de asıl onaycı)
      const reviewerName = acting.isDelegate && acting.onBehalfOfEmployeeId
        ? await getEmployeeFullName(supabase, acting.onBehalfOfEmployeeId)
        : requestedByName;
      if (target) {
        // 7b. Sorumluya "düzeltmeniz bekleniyor" (+ vekili), talep sahibine bilgi
        alreadyNotified.push(target.approver_employee_id);
        await notifyRevisionAssigned(supabase, {
          assigneeEmployeeId: target.approver_employee_id,
          requestId: req.id,
          workflowName,
          requestedByName: actorName,
          comment,
          returnsToName: returnMode === "RETURN_TO_REVIEWER" ? reviewerName || "revizeyi isteyen" : null,
        });
        if (target.approver_employee_id !== req.requester_employee_id) {
          await notifyRequesterRevisionAssigned(supabase, {
            requesterEmployeeId: req.requester_employee_id,
            requestId: req.id,
            workflowName,
            requestedByName: actorName,
            assigneeLabel: target.stepName
              ? `${target.approverName} (${target.stepName})`
              : target.approverName,
            comment,
          });
        }
      } else {
        // 7a. Talep edene REVISION_REQUESTED
        await notifyRevisionRequested(
          supabase,
          req.requester_employee_id,
          req.id,
          workflowName,
          actorName,
          comment,
          undefined,
          extraApproverNames,
          returnMode === "RETURN_TO_REVIEWER" ? reviewerName || actorName : null
        );
      }
    } catch (notifErr) {
      console.error("[request-revision] notification dispatch failed:", notifErr);
    }

    // 8. @mention: talep sahibi (ve ara adım sorumlusu) notu revize bildiriminde zaten aldı
    scheduleMentions({
      requestId: req.id,
      approvalId,
      source: "DECISION",
      note: comment,
      mentionedEmployeeIds: mentionParse.ids,
      actorEmployeeId: appUser.employee_id,
      actorName: actorName || "Onaycı",
      workflowName,
      contextLabel: mentionContextLabel("DECISION", "REVISION_REQUESTED"),
      alreadyNotifiedEmployeeIds: alreadyNotified,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[request-revision] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
