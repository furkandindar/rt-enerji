import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  DELEGATION_ALLOWED_WORKFLOW_CODES,
  DELEGATION_SELECT,
  isDelegationAllowedWorkflow,
  withIsCurrent,
} from "@/lib/workflow/delegation";
import { notifyDelegationAssigned } from "@/lib/workflow/notification-service";

// Vekalet listesi + tanımlama. Faz B / B2.
//
// GET  /api/delegations            → kendi vekaletleri (delegator VEYA delegate olduğu)
// GET  /api/delegations?scope=all  → ORG_ADMIN: tüm vekaletler (RLS admin'e açar)
// POST /api/delegations            → vekalet tanımla (kendi adına; admin herkes adına)
//
// Yetki son savunma hattı RLS'tedir (approval_delegations_* politikaları);
// buradaki kontroller temiz hata mesajı içindir.

// Postgres hata kodları
const PG_EXCLUSION_VIOLATION = "23P01";
const PG_CHECK_VIOLATION = "23514";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
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

    const scope = request.nextUrl.searchParams.get("scope");
    const wantAll = scope === "all" && appUser.role === "ORG_ADMIN";

    let query = supabase
      .from("approval_delegations")
      .select(DELEGATION_SELECT)
      .order("starts_at", { ascending: false });

    if (!wantAll) {
      query = query.or(
        `delegator_employee_id.eq.${appUser.employee_id},delegate_employee_id.eq.${appUser.employee_id}`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[delegations] list failed:", error);
      return NextResponse.json({ error: "Vekaletler yüklenemedi" }, { status: 500 });
    }

    const now = new Date();
    const items = (data ?? []).map((row) =>
      withIsCurrent(row as unknown as { status: string; starts_at: string; ends_at: string }, now)
    );

    return NextResponse.json({
      items,
      viewer_employee_id: appUser.employee_id,
      role: appUser.role,
    });
  } catch (err) {
    console.error("[delegations] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
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

    const body = (await request.json().catch(() => ({}))) as {
      delegate_employee_id?: string;
      delegator_employee_id?: string;
      workflow_code?: string;
      starts_at?: string;
      ends_at?: string;
      reason?: string;
    };

    const isAdmin = appUser.role === "ORG_ADMIN";

    // 1) Delegator: varsayılan kendisi; başkası adına yalnız admin
    const delegatorEmployeeId = body.delegator_employee_id || appUser.employee_id;
    if (delegatorEmployeeId !== appUser.employee_id && !isAdmin) {
      return NextResponse.json(
        { error: "Başkası adına vekalet tanımlamak için yönetici yetkisi gerekir" },
        { status: 403 }
      );
    }

    // 2) Vekil
    const delegateEmployeeId = body.delegate_employee_id?.trim();
    if (!delegateEmployeeId) {
      return NextResponse.json({ error: "Vekil seçilmedi" }, { status: 400 });
    }
    if (delegateEmployeeId === delegatorEmployeeId) {
      return NextResponse.json({ error: "Kişi kendisini vekil olarak tanımlayamaz" }, { status: 400 });
    }

    // 3) Süreç (karar 8: sabit liste)
    const workflowCode = body.workflow_code || DELEGATION_ALLOWED_WORKFLOW_CODES[0];
    if (!isDelegationAllowedWorkflow(workflowCode)) {
      return NextResponse.json(
        { error: "Bu süreç için vekalet tanımlanamaz" },
        { status: 400 }
      );
    }

    const { data: workflow } = await supabase
      .from("workflow_definitions")
      .select("id, code, name")
      .eq("code", workflowCode)
      .eq("is_active", true)
      .maybeSingle();

    if (!workflow) {
      return NextResponse.json({ error: "Süreç bulunamadı" }, { status: 400 });
    }

    // 4) Tarihler (ISO/timestamptz; UI Europe/Istanbul girişini lib/timezone ile çevirir)
    const startsAt = body.starts_at ? new Date(body.starts_at) : null;
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;
    if (!startsAt || isNaN(startsAt.getTime()) || !endsAt || isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: "Başlangıç ve bitiş tarihi zorunludur" }, { status: 400 });
    }
    if (endsAt <= startsAt) {
      return NextResponse.json({ error: "Bitiş tarihi başlangıçtan sonra olmalıdır" }, { status: 400 });
    }
    if (endsAt <= new Date()) {
      return NextResponse.json({ error: "Bitiş tarihi geçmişte olamaz" }, { status: 400 });
    }

    // 5) Vekil: aktif çalışan + uygulama hesabı olmalı (yoksa bildirim/işlem yapamaz)
    const { data: delegate } = await supabase
      .from("employees")
      .select("id, first_name, last_name, status")
      .eq("id", delegateEmployeeId)
      .maybeSingle();

    if (!delegate || delegate.status !== "ACTIVE") {
      return NextResponse.json({ error: "Vekil aktif bir çalışan olmalıdır" }, { status: 400 });
    }

    const { data: delegateAppUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("employee_id", delegateEmployeeId)
      .maybeSingle();

    if (!delegateAppUser) {
      return NextResponse.json(
        { error: "Vekilin uygulama hesabı yok (giriş yapmamış çalışan vekil olamaz)" },
        { status: 400 }
      );
    }

    // 6) Kaydet (kullanıcı bağlamı → RLS insert politikası da doğrular)
    const { data: created, error: insertError } = await supabase
      .from("approval_delegations")
      .insert({
        delegator_employee_id: delegatorEmployeeId,
        delegate_employee_id: delegateEmployeeId,
        workflow_definition_id: workflow.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reason: body.reason?.trim() || null,
        created_by_user_id: user.id,
      })
      .select(DELEGATION_SELECT)
      .single();

    if (insertError || !created) {
      if (insertError?.code === PG_EXCLUSION_VIOLATION) {
        return NextResponse.json(
          { error: "Bu tarih aralığında bu süreç için zaten aktif bir vekalet var" },
          { status: 409 }
        );
      }
      if (insertError?.code === PG_CHECK_VIOLATION) {
        return NextResponse.json({ error: "Geçersiz vekalet bilgisi" }, { status: 400 });
      }
      console.error("[delegations] insert failed:", insertError);
      return NextResponse.json({ error: "Vekalet kaydedilemedi" }, { status: 500 });
    }

    // 7) Bildirim: vekile (+ admin tanımladıysa delegator'a). Hata kaydı engellemesin.
    try {
      const { data: delegator } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", delegatorEmployeeId)
        .maybeSingle();
      const delegatorName = delegator
        ? `${delegator.first_name} ${delegator.last_name}`
        : "Onaycı";
      const delegateName = `${delegate.first_name} ${delegate.last_name}`;

      // Şu an delegator'ın önünde bekleyen (sırası gelmiş) onay sayısı — vekile bilgi
      const pendingCount = await countPendingAtTurn(delegatorEmployeeId, workflow.id);

      await notifyDelegationAssigned(supabase, {
        delegateEmployeeId,
        delegatorEmployeeId,
        delegatorName,
        delegateName,
        workflowName: workflow.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: body.reason?.trim() || null,
        pendingCount,
        createdByOther: delegatorEmployeeId !== appUser.employee_id,
      });
    } catch (notifErr) {
      console.error("[delegations] notification failed:", notifErr);
    }

    return NextResponse.json(
      withIsCurrent(created as unknown as { status: string; starts_at: string; ends_at: string }),
      { status: 201 }
    );
  } catch (err) {
    console.error("[delegations] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Delegator'ın verilen süreçte şu an sırası gelmiş PENDING onay sayısı.
 * Service-role: delegator'ın satırları tanımlayan kişiye (admin değilse) görünmez.
 * "current_step = sequence_order" PostgREST'te ifade edilemediği için JS'te sayılır;
 * hacim tek kişinin bekleyenleri kadar (küçük).
 */
async function countPendingAtTurn(
  delegatorEmployeeId: string,
  workflowDefinitionId: string
): Promise<number> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("request_approvals")
    .select(
      "sequence_order, revision_cycle, request:requests!inner(current_step, status, current_revision_cycle, workflow_definition_id)"
    )
    .eq("approver_employee_id", delegatorEmployeeId)
    .eq("status", "PENDING")
    .eq("request.workflow_definition_id", workflowDefinitionId);

  return (data ?? []).filter((row) => {
    const r = Array.isArray(row.request) ? row.request[0] : row.request;
    if (!r) return false;
    return (
      (r.status === "PENDING" || r.status === "AWAITING_COMPLETION") &&
      r.current_step === row.sequence_order &&
      (r.current_revision_cycle ?? 0) === (row.revision_cycle ?? 0)
    );
  }).length;
}
