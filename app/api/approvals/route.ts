import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/approvals - Kullanıcının bekleyen onaylarını ve onay geçmişini listele
export async function GET() {
  try {
    const supabase = await createClient();

    // Mevcut kullanıcının employee_id'sini al
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // Kullanıcının tüm onaylarını getir (hem bekleyen hem de geçmiş)
    const { data: allApprovals, error } = await supabase
      .from("request_approvals")
      .select(`
        *,
        workflow_step:workflow_steps(*),
        request:requests(
          *,
          workflow_definition:workflow_definitions(id, code, name),
          requester:employees!requests_requester_employee_id_fkey(
            id,
            first_name,
            last_name,
            employee_no,
            employee_positions(
              position:positions(
                id,
                title
              ),
              is_primary,
              end_date
            )
          ),
          leave_request:leave_requests(*),
          salary_advance_request:salary_advance_requests(*),
          overtime_request:overtime_requests(
            *,
            entries:overtime_entries(*)
          ),
          onboarding_request:onboarding_requests(*),
          separation_request:separation_requests(*),
          request_form_request:request_form_requests(*),
          stamp_request:stamp_requests(*, stamp:stamps(*)),
          travel_assignment_request:travel_assignment_requests(*, company:companies(*)),
          approval_letter_request:approval_letter_requests(*),
          finance_approval_cover_request:finance_approval_cover_requests(
            *,
            items:finance_approval_cover_items(*)
          ),
          accounting_approval_cover_request:accounting_approval_cover_requests(
            *,
            items:accounting_approval_cover_items(*)
          ),
          mukayese_request:mukayese_requests(
            *,
            items:mukayese_items(*, prices:mukayese_prices(*)),
            suppliers:mukayese_suppliers(*)
          ),
          expense_request:expense_requests(
            *,
            items:expense_items(*)
          ),
          approvals:request_approvals(
            id,
            status,
            comment,
            decided_at,
            created_at,
            sequence_order,
            revision_cycle,
            workflow_step:workflow_steps(
              step_order,
              name,
              approver_type,
              phase,
              form_section_key
            ),
            approver:employees!request_approvals_approver_employee_id_fkey(
              id,
              first_name,
              last_name
            )
          )
        )
      `)
      .eq("approver_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching approvals:", error);
      return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
    }

    // mukayese_prices, mukayese_items altında nested gelir; consumer'lar için
    // top-level mukayese_request.prices flat array'ine düzleştir.
    // Aynı geçişte V5: nested approvals'ı aktif cycle'a filtrele.
    for (const a of allApprovals || []) {
      const req = (a as { request?: { mukayese_request?: { items?: Array<{ prices?: unknown[] }>; prices?: unknown[] }; current_revision_cycle?: number; approvals?: Array<{ revision_cycle?: number }> } }).request;
      const m = req?.mukayese_request;
      if (m?.items) m.prices = m.items.flatMap((it) => it.prices ?? []);

      const activeCycle = req?.current_revision_cycle ?? 0;
      if (req && Array.isArray(req.approvals)) {
        req.approvals = req.approvals.filter((x) => (x.revision_cycle ?? 0) === activeCycle);
      }
    }

    // Bekleyen onayları filtrele:
    // PENDING + sırası gelen + AKTİF CYCLE (eski cycle'ın PENDING'i zaten REVISION_REQUESTED veya
    // yeni cycle PENDING'i ile değişmiş olur, yine de güvenlik için filter)
    const pendingApprovals = allApprovals?.filter(approval => {
      const request = approval.request as { current_step?: number; current_revision_cycle?: number } | null;
      return approval.status === "PENDING" &&
             request &&
             request.current_step === approval.sequence_order &&
             (approval.revision_cycle ?? 0) === (request.current_revision_cycle ?? 0);
    }) || [];

    // Onay geçmişi: APPROVED, REJECTED veya REVISION_REQUESTED (V5: revize iste de history sayılır)
    //
    // V5 filter kuralları:
    // 1. REQUESTER tipindeki auto-APPROVED kayıtlar gerçek onay kararı değil
    //    (createApprovalChain insert anında talep gönderme imzası olarak işaretliyor).
    // 2. Forward auto-approve dedup: aynı kullanıcı aynı talepte birden fazla adımda
    //    onaycı olabilir (örn. 2. adım UNIT_HEAD + 4. adım STATIC_POSITION). Onaycı
    //    gerçek kararını verdiğinde aynı kişiye ait ilerideki SIGN_ONLY adımlar
    //    otomatik APPROVED'a çekilir (app/api/approvals/[id]/route.ts forward
    //    auto-approve mantığı). Bu auto-APPROVED kayıtlar fiilen verilen bir karar
    //    değil; history'de gösterirsek aynı talep N kez listelenir.
    //    Çözüm: (request_id, revision_cycle) için en küçük sequence_order'lı kaydı
    //    tutuyoruz — bu fiilen tıklanan karardır.
    const filteredHistory = (allApprovals ?? []).filter(approval => {
      if (!["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(approval.status)) {
        return false;
      }
      const stepType = Array.isArray(approval.workflow_step)
        ? approval.workflow_step[0]?.approver_type
        : (approval.workflow_step as { approver_type?: string } | null)?.approver_type;
      return stepType !== "REQUESTER";
    });

    type HistoryRow = (typeof filteredHistory)[number];
    const dedupMap = new Map<string, HistoryRow>();
    for (const a of filteredHistory) {
      const requestId = (a as { request_id: string }).request_id;
      const cycle = (a as { revision_cycle?: number }).revision_cycle ?? 0;
      const seq = (a as { sequence_order: number }).sequence_order;
      const key = `${requestId}:${cycle}`;
      const existing = dedupMap.get(key);
      if (!existing || seq < (existing as { sequence_order: number }).sequence_order) {
        dedupMap.set(key, a);
      }
    }
    const approvalHistory = Array.from(dedupMap.values());

    return NextResponse.json({
      pending: pendingApprovals,
      history: approvalHistory,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

