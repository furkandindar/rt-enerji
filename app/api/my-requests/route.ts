import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { MY_REQUESTS_LIST_SELECT } from "@/lib/my-requests/server-selects";

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

// Edit-mode caller'ları (leave/expense/travel/... new sayfaları) tüm nested
// veriyi bekliyor. Pagination'sız çağrılarda full select korunur; pagination
// var olduğunda minimal liste-select'i kullanılır (büyük performans kazancı).
const FULL_LEGACY_SELECT = `
  *,
  workflow_definition:workflow_definitions!inner(id, code, name),
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
    ),
    acted_by_employee_id,
    acted_by:employees!acted_by_employee_id(
      id,
      first_name,
      last_name
    )
  )
`;

// GET /api/my-requests - Kullanıcının tüm taleplerini listele (generic)
//
// Pagination (backwards-compatible):
//   - "page" veya "page_size" query'de yoksa tüm liste döner (eski davranış);
//     edit-mode caller'ları (leave/expense/travel/... new sayfaları) bu yolu kullanır.
//   - Var olduğunda .range() + count: 'exact' ile sayfalama uygulanır ve "total" döner.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    // Filter parameters
    const workflowCode = searchParams.get("workflow_code");
    const status = searchParams.get("status");

    // Pagination parameters
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("page_size");
    const usePagination = pageParam !== null || pageSizeParam !== null;

    const pageSize = (() => {
      const n = Number(pageSizeParam);
      return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n)
        ? n
        : DEFAULT_PAGE_SIZE;
    })();
    const page = (() => {
      const n = Number(pageParam);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    })();

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
    // - Pagination'lı çağrı (Taleplerim sayfası): minimal liste select.
    //   Tabloda sadece request_no, workflow_definition.name, status,
    //   created_at, updated_at kullanılıyor; spesifik talep tipi nested
    //   join'leri burada gereksiz ve çok ağır.
    // - Pagination'sız çağrı (edit-mode caller'ları): full select.
    //   workflow_code filtresi joined alana göre — workflow_definitions!inner
    //   ile DB-side filtreleniyor.
    const selectStr = usePagination ? MY_REQUESTS_LIST_SELECT : FULL_LEGACY_SELECT;
    let query = supabase
      .from("requests")
      .select(selectStr, usePagination ? { count: "exact" } : {})
      .eq("requester_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (workflowCode) {
      query = query.eq("workflow_definition.code", workflowCode);
    }

    // Apply pagination if requested
    if (usePagination) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    // Execute query
    const { data: requests, error, count } = await query;

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    const filteredRequests = requests || [];

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
      ...(usePagination ? { total: count ?? 0, page, page_size: pageSize } : {}),
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
