import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveExtraApproverTarget } from "@/lib/workflow/extra-approvers-shared";
import {
  fetchWorkflowStepsForExtras,
  loadLockedExtraApprovers,
} from "@/lib/workflow/extra-approvers";

// GET /api/requests/[id]/extra-approvers
// Talebin ek onaycı durumu: süreçte özellik açık mı, eklenenler hangi dinamik
// adıma yazılıyor ve yöneticinin eklediği (talep sahibinin çıkaramayacağı)
// kilitli kişiler kim. Düzenleme formu ve detay ekranları kullanır.
//
// Erişim: talebi RLS ile görebilen herkes (requests select policy). Görme
// doğrulandıktan sonra adım/isim okumaları service role ile yapılır.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: req } = await supabase
      .from("requests")
      .select("id, workflow_definition_id")
      .eq("id", requestId)
      .maybeSingle();

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const admin = createServiceRoleClient();
    const steps = await fetchWorkflowStepsForExtras(admin, req.workflow_definition_id);
    const managerStep = steps.find(
      (s) => s.can_add_extra_approvers === true && resolveExtraApproverTarget(steps, s.id) !== null
    );
    const target = managerStep ? resolveExtraApproverTarget(steps, managerStep.id) : null;

    if (!target) {
      return NextResponse.json({ enabled: false, dynamicStepId: null, locked: [] });
    }

    const locked = await loadLockedExtraApprovers(admin, requestId);
    const personIds = Array.from(
      new Set(locked.flatMap((l) => [l.employee_id, l.added_by_employee_id]))
    );
    const { data: people } = personIds.length
      ? await admin.from("employees").select("id, first_name, last_name").in("id", personIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] };
    const nameById = new Map(
      (people ?? []).map((p: { id: string; first_name: string; last_name: string }) => [
        p.id,
        `${p.first_name} ${p.last_name}`.trim(),
      ])
    );

    return NextResponse.json({
      enabled: true,
      dynamicStepId: target.dynamicStepId,
      locked: locked.map((l) => ({
        employee_id: l.employee_id,
        employee_name: nameById.get(l.employee_id) ?? null,
        added_by_employee_id: l.added_by_employee_id,
        added_by_name: nameById.get(l.added_by_employee_id) ?? null,
        workflow_step_id: l.workflow_step_id,
        mode: l.mode,
        added_in_cycle: l.added_in_cycle,
        note: l.note,
        created_at: l.created_at,
      })),
    });
  } catch (err) {
    console.error("[extra-approvers GET] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
