import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/approvals - Kullanıcının bekleyen onaylarını listele
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

    // Kullanıcının bekleyen onaylarını getir
    const { data: approvals, error } = await supabase
      .from("request_approvals")
      .select(`
        *,
        workflow_step:workflow_steps(*),
        request:requests(
          *,
          workflow_definition:workflow_definitions(id, code, name),
          requester:employees!requests_requester_employee_id_fkey(
            id, first_name, last_name, employee_no
          ),
          leave_request:leave_requests(*)
        )
      `)
      .eq("approver_employee_id", appUser.employee_id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching approvals:", error);
      return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
    }

    // Sadece current_step'teki onayları filtrele (sırası gelen)
    const pendingApprovals = approvals?.filter(approval => {
      const request = approval.request;
      const step = approval.workflow_step;
      return request && step && request.current_step === step.step_order;
    });

    return NextResponse.json(pendingApprovals);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

