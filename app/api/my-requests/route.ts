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
          sequence_order,
          revision_cycle,
          workflow_step:workflow_steps(
            step_order,
            name,
            approver_type,
            phase,
            form_section_key
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

    // mukayese_prices, mukayese_items altında nested gelir; consumer'lar için
    // top-level mukayese_request.prices flat array'ine düzleştir.
    for (const r of filteredRequests) {
      const m = (r as { mukayese_request?: { items?: Array<{ prices?: unknown[] }>; prices?: unknown[] } }).mukayese_request;
      if (m?.items) m.prices = m.items.flatMap((it) => it.prices ?? []);
    }

    // V5: approvals'ı sadece aktif cycle'a filtrele (eski cycle audit için DB'de kalır
    // ama UI/onaycı listeleri yalnız aktif cycle'ı görmeli)
    for (const r of filteredRequests) {
      const reqRec = r as { current_revision_cycle?: number; approvals?: Array<{ revision_cycle?: number }> };
      const activeCycle = reqRec.current_revision_cycle ?? 0;
      if (Array.isArray(reqRec.approvals)) {
        reqRec.approvals = reqRec.approvals.filter(
          (a) => (a.revision_cycle ?? 0) === activeCycle
        );
      }
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

