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
            workflow_step:workflow_steps(
              step_order,
              name,
              approver_type
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
    for (const a of allApprovals || []) {
      const m = (a as { request?: { mukayese_request?: { items?: Array<{ prices?: unknown[] }>; prices?: unknown[] } } }).request?.mukayese_request;
      if (m?.items) m.prices = m.items.flatMap((it) => it.prices ?? []);
    }

    // Bekleyen onayları filtrele (PENDING ve sırası gelen)
    const pendingApprovals = allApprovals?.filter(approval => {
      const request = approval.request;
      return approval.status === "PENDING" &&
             request &&
             request.current_step === approval.sequence_order;
    }) || [];

    // Onay geçmişini filtrele (APPROVED veya REJECTED)
    const approvalHistory = allApprovals?.filter(approval => {
      return approval.status === "APPROVED" || approval.status === "REJECTED";
    }) || [];

    return NextResponse.json({
      pending: pendingApprovals,
      history: approvalHistory,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

