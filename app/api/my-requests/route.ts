import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/my-requests - Kullanıcının tüm taleplerini listele (generic)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    
    // Filter parameters
    const workflowCode = searchParams.get("workflow_code");
    const status = searchParams.get("status");

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

    // Build query
    let query = supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        leave_request:leave_requests(*),
        requester:employees!requester_employee_id(
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
          approver:employees!approver_employee_id(
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }

    // Execute query
    const { data: requests, error } = await query;

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    // Filter by workflow_code if provided (need to filter in JS since it's a joined field)
    let filteredRequests = requests || [];
    if (workflowCode) {
      filteredRequests = filteredRequests.filter(
        (r) => r.workflow_definition?.code === workflowCode
      );
    }

    // Get workflow definitions for filter dropdown
    const { data: workflowDefinitions } = await supabase
      .from("workflow_definitions")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    return NextResponse.json({
      requests: filteredRequests,
      workflowDefinitions: workflowDefinitions || [],
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

