import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  applyAuditStamp,
  canRequestRevision,
  notifyApprover,
  notifyExtraApproversAdded,
} from "@/lib/workflow";
import { resolveActingRights, getEmployeeFullName, formatActingName } from "@/lib/workflow/delegation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getEmployeeNamesInOrder,
  insertExtraApproversDirect,
  validateManagerExtraApprovers,
} from "@/lib/workflow/extra-approvers";

// POST /api/approvals/[id]/add-approvers
// Ek onaycı — DIRECT mod: belge değişmeden, yönetici (can_add_extra_approvers
// adımının onaycısı; Olur'da Genel Müdür) sırası gelmiş PENDING kaydında zincire
// kişi ekler. Eklenenler MEVCUT turda yöneticinin hemen önüne girer; onlar
// onaylayınca sıra yöneticiye döner. Önceki onaycılar yeniden onaylamaz.
// (Revizeyle birlikte ekleme: POST /api/approvals/[id]/request-revision + extraApproverIds.)
//
// Body: { employeeIds: string[] (sıralı), note?: string }
//
// Etki (tek transaction — RPC insert_extra_approvers_before):
//   - Yöneticinin satırı ve sonrası N kaydırılır, eklenenler araya PENDING girer
//   - requests.current_step değişmez → ilk eklenen kişiyi gösterir
//   - request_extra_approvers'a kilitli kayıt (ileriki revize turlarında da kalır)
// Bildirim: ilk eklenen kişiye APPROVAL_REQUIRED; talep edene bilgi.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: approvalId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      employeeIds?: unknown;
      note?: unknown;
    };

    if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ error: "Geçersiz not" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";

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

    const actorEmp = (appUser as unknown as { employee?: { first_name?: string; last_name?: string } }).employee;
    const actorName = actorEmp ? `${actorEmp.first_name || ""} ${actorEmp.last_name || ""}`.trim() : "";

    // 2. Approval + request yükle (RLS: satırı yalnız onaycı/vekil/talep sahibi/admin görür).
    //    workflow_step(*): can_add_extra_approvers kolonu SQL öncesi yoktur, adıyla seçilmez.
    const { data: approval, error: approvalError } = await supabase
      .from("request_approvals")
      .select(`
        id,
        status,
        sequence_order,
        revision_cycle,
        approver_employee_id,
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
    const step = (approval as unknown as { workflow_step?: { id?: string } | null }).workflow_step;

    // 3. İşlem yetkisi: revize ile aynı eşik (kendisi/vekil, satır PENDING, talep
    //    PENDING, sırası gelmiş) + aktif tur. Tamamlanmış/arşivlenmiş belge açılamaz.
    const acting = await resolveActingRights(
      supabase,
      approvalId,
      approval.approver_employee_id,
      appUser.employee_id
    );
    const eligible = canRequestRevision(
      {
        status: approval.status,
        sequence_order: approval.sequence_order,
        approver_employee_id: approval.approver_employee_id,
      },
      { status: req.status as "PENDING", current_step: req.current_step },
      { employeeId: appUser.employee_id, role: appUser.role },
      acting
    );
    const isActiveCycle = (approval.revision_cycle ?? 0) === (req.current_revision_cycle ?? 0);
    if (!eligible || !isActiveCycle) {
      return NextResponse.json(
        { error: "Onaycı eklenemez: sıra sizde değil veya talep işleme kapalı" },
        { status: 409 }
      );
    }

    // 4. Adım bayrağı + aday doğrulaması
    const admin = createServiceRoleClient();
    const check = await validateManagerExtraApprovers(admin, {
      requestId: req.id,
      workflowDefinitionId: req.workflow_definition_id,
      managerStepId: step?.id ?? "",
      requesterEmployeeId: req.requester_employee_id,
      actorEmployeeId: appUser.employee_id,
      cycle: req.current_revision_cycle ?? 0,
      rawIds: body.employeeIds,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // 5. Atomik ekleme (durum, talep satırı kilitliyken DB'de yeniden kontrol edilir)
    const inserted = await insertExtraApproversDirect(admin, {
      beforeApprovalId: approvalId,
      dynamicStepId: check.target.dynamicStepId,
      employeeIds: check.employeeIds,
      addedByEmployeeId: appUser.employee_id,
      note: note || null,
    });
    if (!inserted.ok) {
      return NextResponse.json({ error: inserted.error }, { status: inserted.status });
    }

    // 6. Audit
    await applyAuditStamp(supabase, req.id, "EXTRA_APPROVERS_ADDED", appUser.employee_id);

    // 7. Bildirimler — hata ana akışı engellemesin (ekleme tamamlandı)
    try {
      const workflowName = req.workflow_definition?.name ?? "Talep";
      const addedByName =
        acting.isDelegate && acting.onBehalfOfEmployeeId
          ? formatActingName(
              actorName || "Onaycı",
              await getEmployeeFullName(supabase, acting.onBehalfOfEmployeeId)
            )
          : actorName || "Onaycı";
      const requesterName =
        (await getEmployeeFullName(admin, req.requester_employee_id)) || "Bir çalışan";

      // RLS: notifyApprover içindeki CTA araması yeni satırı görebilmeli → service role
      await notifyApprover(admin, check.employeeIds[0], requesterName, req.id, workflowName);

      const names = await getEmployeeNamesInOrder(admin, check.employeeIds);
      await notifyExtraApproversAdded(
        admin,
        req.requester_employee_id,
        req.id,
        workflowName,
        addedByName,
        names,
        note || null
      );
    } catch (notifErr) {
      console.error("[add-approvers] notification dispatch failed:", notifErr);
    }

    return NextResponse.json({ success: true, added: check.employeeIds.length });
  } catch (err) {
    console.error("[add-approvers] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
