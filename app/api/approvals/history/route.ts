import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { APPROVAL_LIST_SELECT } from "@/lib/approvals/server-selects";

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_DECISIONS = ["APPROVED", "REJECTED", "REVISION_REQUESTED"] as const;

// GET /api/approvals/history - Kullanıcının onay geçmişi (server-side paged)
//
// Query params:
//   - page, page_size: pagination
//   - workflow_code: opsiyonel, talep tipine göre filtrele
//   - decision: opsiyonel, kullanıcının verdiği karara göre filtrele
//     (APPROVED, REJECTED, REVISION_REQUESTED)
//
// Response:
//   - items: page'in onayları (minimal nested select)
//   - total, page, page_size
//   - workflowDefinitions: filtre dropdown'unu beslemek için tüm aktif workflow'lar
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const pageSize = (() => {
      const n = Number(searchParams.get("page_size"));
      return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n)
        ? n
        : DEFAULT_PAGE_SIZE;
    })();
    const page = (() => {
      const n = Number(searchParams.get("page"));
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    })();
    const workflowCode = searchParams.get("workflow_code");
    const decisionParam = searchParams.get("decision");
    const decision = decisionParam && (ALLOWED_DECISIONS as readonly string[]).includes(decisionParam)
      ? decisionParam
      : null;

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

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Step 1: view'dan paged id seti + count (+ opsiyonel filtreler)
    let idQuery = supabase
      .from("v_user_approval_history")
      .select("id", { count: "exact" })
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (workflowCode) {
      idQuery = idQuery.eq("workflow_definition_code", workflowCode);
    }
    if (decision) {
      idQuery = idQuery.eq("status", decision);
    }

    const { data: idRows, error: idError, count } = await idQuery;

    if (idError) {
      console.error("Error fetching history ids:", idError);
      return NextResponse.json({ error: "Failed to fetch approval history" }, { status: 500 });
    }

    // Workflow definitions for filter dropdown
    const { data: workflowDefinitions } = await supabase
      .from("workflow_definitions")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    const ids = (idRows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({
        items: [],
        total: count ?? 0,
        page,
        page_size: pageSize,
        workflowDefinitions: workflowDefinitions ?? [],
        viewer_employee_id: appUser.employee_id, // Vekalet (B2): satır approver ≠ ben ise \"vekaleten\"
      });
    }

    // Step 2: minimal liste select
    const { data: items, error: itemsError } = await supabase
      .from("request_approvals")
      .select(APPROVAL_LIST_SELECT)
      .in("id", ids);

    if (itemsError) {
      console.error("Error fetching approval history:", itemsError);
      return NextResponse.json({ error: "Failed to fetch approval history" }, { status: 500 });
    }

    // View'daki id sırasını koru (decided_at desc sıralaması Step 1'den geliyor)
    const orderIndex = new Map(ids.map((id, idx) => [id, idx]));
    const ordered = (items ?? []).slice().sort((a, b) => {
      const ai = orderIndex.get((a as { id: string }).id) ?? 0;
      const bi = orderIndex.get((b as { id: string }).id) ?? 0;
      return ai - bi;
    });

    return NextResponse.json({
      items: ordered,
      total: count ?? 0,
      page,
      page_size: pageSize,
      workflowDefinitions: workflowDefinitions ?? [],
      viewer_employee_id: appUser.employee_id, // Vekalet (B2): satır approver ≠ ben ise \"vekaleten\"
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
