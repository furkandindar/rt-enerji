// Süreç Tanımları — sabit pozisyonlu adımın pozisyonunu panelden değiştirme (Faz 2a).
//
//   GET   /api/workflow-steps/[id]
//     → Bu adımda bekleyen (aktif turda PENDING) talep sayısı ve o satırlardaki
//       onaycılar. Pozisyon değişince bunlar mevcut onaycıda kalır; pencere bunu
//       önceden gösterir.
//
//   PATCH /api/workflow-steps/[id]  { static_position_id, name? }
//     → Yalnız STATIC_POSITION adımı. Yeni pozisyon motorun çözebileceği durumda
//       olmalı (positionAssignmentBlocker: aktif, tek açık atama, aktif çalışan).
//       Yalnız static_position_id ve name yazılır.
//
// Yetki: ORG_ADMIN. Yazma RLS'li client ile (workflow_steps_update_admin); log
// kaydını DB trigger'ı atar (sql/feature_workflow_step_change_log.sql).
// Değişiklik yalnız bundan sonra gönderilen talepleri etkiler — onaycı gönderim
// anında çözülür; bekleyen onay satırlarına dokunulmaz.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  positionAssignmentBlocker,
  STEP_NAME_MAX_LENGTH,
} from "@/lib/workflow/step-position-rules";

type AdminGuard =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

async function requireOrgAdmin(): Promise<AdminGuard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (appUser?.role !== "ORG_ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden — admin yetkisi gerekli" }, { status: 403 }),
    };
  }
  return { ok: true, supabase };
}

interface PendingRow {
  request_id: string;
  revision_cycle: number | null;
  request: { status: string; current_revision_cycle: number | null } | { status: string; current_revision_cycle: number | null }[] | null;
  approver: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

function unwrapOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireOrgAdmin();
    if (!guard.ok) return guard.response;
    const { supabase } = guard;
    const { id: stepId } = await params;

    // Talep hâlâ onayda (PENDING) ve bu adımın aktif turdaki satırı PENDING.
    // REVISION_REQUESTED talepler sayılmaz: yeniden gönderimde zincir baştan
    // çözüleceği için yeni pozisyonu alırlar.
    const { data, error } = await supabase
      .from("request_approvals")
      .select(
        "request_id, revision_cycle, request:requests!inner(status, current_revision_cycle), approver:employees!approver_employee_id(first_name, last_name)"
      )
      .eq("workflow_step_id", stepId)
      .eq("status", "PENDING")
      .eq("request.status", "PENDING");

    if (error) {
      console.error("[workflow-steps GET] pending load failed:", error);
      return NextResponse.json({ error: "Bekleyen talepler yüklenemedi" }, { status: 500 });
    }

    const requestIds = new Set<string>();
    const countByApprover = new Map<string, number>();
    for (const row of (data ?? []) as PendingRow[]) {
      const req = unwrapOne(row.request);
      if (!req || (row.revision_cycle ?? 0) !== (req.current_revision_cycle ?? 0)) continue;
      if (requestIds.has(row.request_id)) continue;
      requestIds.add(row.request_id);
      const approver = unwrapOne(row.approver);
      const name = approver ? `${approver.first_name} ${approver.last_name}`.trim() : "Bilinmeyen";
      countByApprover.set(name, (countByApprover.get(name) ?? 0) + 1);
    }

    return NextResponse.json({
      pending_count: requestIds.size,
      approvers: Array.from(countByApprover, ([name, count]) => ({ name, count })).sort(
        (a, b) => b.count - a.count
      ),
    });
  } catch (err) {
    console.error("[workflow-steps GET] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireOrgAdmin();
    if (!guard.ok) return guard.response;
    const { supabase } = guard;
    const { id: stepId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { static_position_id?: unknown; name?: unknown }
      | null;
    const positionId = typeof body?.static_position_id === "string" ? body.static_position_id : null;
    if (!positionId) {
      return NextResponse.json({ error: "Pozisyon seçilmedi" }, { status: 400 });
    }

    let name: string | undefined;
    if (body?.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Adım adı boş olamaz" }, { status: 400 });
      }
      name = body.name.trim();
      if (name.length > STEP_NAME_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Adım adı en fazla ${STEP_NAME_MAX_LENGTH} karakter olabilir` },
          { status: 400 }
        );
      }
    }

    // 1. Adım: yalnız sabit pozisyonlu adımın pozisyonu değiştirilebilir
    const { data: step, error: stepError } = await supabase
      .from("workflow_steps")
      .select("id, name, approver_type, static_position_id")
      .eq("id", stepId)
      .maybeSingle();
    if (stepError || !step) {
      return NextResponse.json({ error: "Adım bulunamadı" }, { status: 404 });
    }
    if (step.approver_type !== "STATIC_POSITION") {
      return NextResponse.json(
        { error: "Yalnız sabit pozisyonlu adımların pozisyonu değiştirilebilir" },
        { status: 400 }
      );
    }

    const nameChanged = name !== undefined && name !== step.name;
    if (positionId === step.static_position_id && !nameChanged) {
      return NextResponse.json({ error: "Değişiklik yok" }, { status: 400 });
    }

    // 2. Yeni pozisyon motorun çözebileceği durumda olmalı (UI ile aynı kural)
    const [{ data: position, error: positionError }, { data: holders, error: holdersError }] =
      await Promise.all([
        supabase.from("positions").select("id, is_active").eq("id", positionId).maybeSingle(),
        supabase
          .from("employee_positions")
          .select("employee_id, employee:employees(status)")
          .eq("position_id", positionId)
          .is("end_date", null),
      ]);
    if (positionError || !position) {
      return NextResponse.json({ error: "Pozisyon bulunamadı" }, { status: 400 });
    }
    if (holdersError) {
      console.error("[workflow-steps PATCH] holders load failed:", holdersError);
      return NextResponse.json({ error: "Pozisyon atamaları yüklenemedi" }, { status: 500 });
    }

    const blocker = positionAssignmentBlocker({
      is_active: position.is_active,
      holders: (holders ?? []).map((h) => ({
        status: unwrapOne(h.employee as { status: string } | { status: string }[] | null)?.status ?? "UNKNOWN",
      })),
    });
    if (blocker) {
      return NextResponse.json(
        { error: `Bu pozisyon adıma atanamaz: ${blocker}` },
        { status: 422 }
      );
    }

    // 3. Yaz — yalnız iki alan. RLS UPDATE'i sessizce 0 satıra düşürebilir; kontrol et.
    const patch: { static_position_id: string; name?: string } = { static_position_id: positionId };
    if (nameChanged) patch.name = name;

    const { data: updated, error: updateError } = await supabase
      .from("workflow_steps")
      .update(patch)
      .eq("id", stepId)
      .select("id");

    if (updateError) {
      console.error("[workflow-steps PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Adım güncellenemedi" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "Adım güncellenemedi (yetki yok ya da adım bulunamadı)" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[workflow-steps PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
