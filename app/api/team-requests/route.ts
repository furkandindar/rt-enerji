import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserAccess } from "@/lib/auth/access";

// GET /api/team-requests — "Birimimin Talepleri" (Müdür).
// Müdür = aktif birim amiri pozisyonu olan kişi (rol değil, org şemadan türetilir).
// Kapsam DB'de tek yerde: public.unit_manager_requests() →
// private.rls_unit_manager_request_ids(): amiri olduğu birim + alt birimlerdeki
// çalışanların, "Müdür görür" işaretli süreçlerdeki talepleri; taslak, içerik
// kısıtlı süreçler ve kendi talepleri hariç. Salt okunur.
// SQL: sql/feature_roles_2_unit_manager_scope.sql

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const PG_STATEMENT_TIMEOUT = "57014";

const LIST_SELECT = `
  id,
  request_no,
  status,
  created_at,
  updated_at,
  workflow_definition:workflow_definitions!inner(id, code, name),
  requester:employees!requester_employee_id(id, first_name, last_name)
`;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getUserAccess(supabase);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.is_unit_manager) {
      return NextResponse.json(
        { error: "Bu liste birim amirlerine açıktır" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const workflowCode = searchParams.get("workflow_code");
    const status = searchParams.get("status");
    const pageSize = (() => {
      const n = Number(searchParams.get("page_size"));
      return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
    })();
    const page = (() => {
      const n = Number(searchParams.get("page"));
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    })();

    // Filtre seçenekleri: Müdür'e açık süreçler. Süreç filtresi id ile uygulanır —
    // PostgREST, RPC sonucunda gömülü ilişki filtresini (workflow_definition.code) desteklemiyor.
    const { data: workflowDefinitions } = await supabase
      .from("workflow_definitions")
      .select("id, code, name")
      .eq("unit_manager_visible", true)
      .eq("is_active", true)
      .order("name");

    let query = supabase
      .rpc("unit_manager_requests", {}, { count: "exact" })
      .select(LIST_SELECT)
      .order("created_at", { ascending: false });

    if (status && status !== "all") query = query.eq("status", status);
    if (workflowCode && workflowCode !== "all") {
      const wf = (workflowDefinitions ?? []).find((w) => w.code === workflowCode);
      if (!wf) {
        return NextResponse.json({
          requests: [],
          total: 0,
          page,
          page_size: pageSize,
          workflowDefinitions: workflowDefinitions ?? [],
        });
      }
      query = query.eq("workflow_definition_id", wf.id);
    }

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("[team-requests] list failed:", error);
      const isTimeout = error.code === PG_STATEMENT_TIMEOUT;
      return NextResponse.json(
        { error: isTimeout ? "Sorgu zaman aşımına uğradı, lütfen tekrar deneyin." : "Talepler alınamadı" },
        { status: isTimeout ? 504 : 500 }
      );
    }

    return NextResponse.json({
      requests: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
      workflowDefinitions: workflowDefinitions ?? [],
    });
  } catch (error) {
    console.error("[team-requests] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
