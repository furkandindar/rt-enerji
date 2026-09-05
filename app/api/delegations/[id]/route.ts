import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyDelegationCancelled } from "@/lib/workflow/notification-service";
import { DELEGATION_SELECT, withIsCurrent } from "@/lib/workflow/delegation";

// PATCH /api/delegations/[id] — vekaleti iptal et veya bitişini kısalt. Faz B / B2.
// Body: { action: "cancel" }  |  { ends_at: ISO }
// Yetki: delegator veya ORG_ADMIN (RLS update politikası da aynı kuralı uygular).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

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
      action?: "cancel";
      ends_at?: string;
    };

    // Satırı yükle (RLS: yalnız taraflar/admin görür)
    const { data: existing } = await supabase
      .from("approval_delegations")
      .select(DELEGATION_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Vekalet bulunamadı" }, { status: 404 });
    }

    const row = existing as unknown as {
      id: string;
      status: string;
      starts_at: string;
      ends_at: string;
      delegator_employee_id: string;
      delegate_employee_id: string;
      delegator?: { first_name: string; last_name: string } | null;
      delegate?: { first_name: string; last_name: string } | null;
      workflow_definition?: { name: string } | null;
    };

    const isAdmin = appUser.role === "ORG_ADMIN";
    if (row.delegator_employee_id !== appUser.employee_id && !isAdmin) {
      return NextResponse.json({ error: "Bu vekaleti yalnız tanımlayan kişi veya yönetici değiştirebilir" }, { status: 403 });
    }
    if (row.status !== "ACTIVE") {
      return NextResponse.json({ error: "Vekalet zaten iptal edilmiş" }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    let update: Record<string, unknown>;
    let endedEarly = false;

    if (body.action === "cancel") {
      update = {
        status: "CANCELLED",
        cancelled_at: nowIso,
        cancelled_by_user_id: user.id,
      };
      endedEarly = true;
    } else if (body.ends_at) {
      const newEnd = new Date(body.ends_at);
      if (isNaN(newEnd.getTime())) {
        return NextResponse.json({ error: "Geçersiz bitiş tarihi" }, { status: 400 });
      }
      if (newEnd <= new Date(row.starts_at)) {
        return NextResponse.json({ error: "Bitiş tarihi başlangıçtan sonra olmalıdır" }, { status: 400 });
      }
      update = { ends_at: newEnd.toISOString() };
      endedEarly = newEnd < new Date(row.ends_at);
    } else {
      return NextResponse.json({ error: "action=cancel veya ends_at gerekli" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("approval_delegations")
      .update(update)
      .eq("id", id)
      .eq("status", "ACTIVE") // race-safe
      .select(DELEGATION_SELECT)
      .single();

    if (updateError || !updated) {
      console.error("[delegations] update failed:", updateError);
      return NextResponse.json({ error: "Vekalet güncellenemedi" }, { status: 500 });
    }

    // Vekile bilgi (iptal / erken bitiş). Hata güncellemeyi geri almaz.
    if (endedEarly) {
      try {
        await notifyDelegationCancelled(supabase, {
          delegateEmployeeId: row.delegate_employee_id,
          delegatorName: row.delegator
            ? `${row.delegator.first_name} ${row.delegator.last_name}`
            : "Onaycı",
          workflowName: row.workflow_definition?.name ?? "süreç",
          cancelled: body.action === "cancel",
          newEndsAt: body.action === "cancel" ? null : (update.ends_at as string),
        });
      } catch (notifErr) {
        console.error("[delegations] cancel notification failed:", notifErr);
      }
    }

    return NextResponse.json(
      withIsCurrent(updated as unknown as { status: string; starts_at: string; ends_at: string })
    );
  } catch (err) {
    console.error("[delegations] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
