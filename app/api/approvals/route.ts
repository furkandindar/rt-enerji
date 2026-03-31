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
          approvals:request_approvals(
            id,
            status,
            comment,
            decided_at,
            created_at,
            workflow_step:workflow_steps(
              step_order,
              name
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

    // Bekleyen onayları filtrele (PENDING ve sırası gelen)
    const pendingApprovals = allApprovals?.filter(approval => {
      const request = approval.request;
      const step = approval.workflow_step;
      return approval.status === "PENDING" &&
             request &&
             step &&
             request.current_step === step.step_order;
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

