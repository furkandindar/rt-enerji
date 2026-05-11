import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getRequestDetailSelect } from "@/lib/my-requests/server-selects";

// Postgres "canceling statement due to statement timeout"
const PG_STATEMENT_TIMEOUT = "57014";

// GET /api/my-requests/[id] - Tek bir talebin tüm detaylarını getirir.
// RLS, talep sahibi / onaycı / ORG_ADMIN'in erişimini garanti eder.
//
// İki adımlı (type-aware) sorgu:
//   1) Hafif fetch: workflow_definition.code öğren (1 satır, çok az join).
//   2) Code'a göre sadece o tipin nested join'ini içeren full select.
// Eski monolitik 13 join'lik select Postgres'te statement timeout yiyebiliyordu.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

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

    // Step 1: hafif fetch — sadece workflow code lazım
    const { data: head, error: headError } = await supabase
      .from("requests")
      .select(`workflow_definition:workflow_definitions(code)`)
      .eq("id", requestId)
      .maybeSingle();

    if (headError) {
      console.error("Error fetching request head:", headError);
      const isTimeout = headError.code === PG_STATEMENT_TIMEOUT;
      return NextResponse.json(
        { error: isTimeout ? "Sorgu zaman aşımına uğradı, lütfen tekrar deneyin." : "Failed to fetch request" },
        { status: isTimeout ? 504 : 500 }
      );
    }
    if (!head) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const workflowCode =
      (head as { workflow_definition?: { code?: string } | null }).workflow_definition?.code ?? null;

    // Step 2: type-aware full select
    const { data: request, error } = await supabase
      .from("requests")
      .select(getRequestDetailSelect(workflowCode))
      .eq("id", requestId)
      .single();

    if (error) {
      console.error("Error fetching request:", error);
      const isTimeout = error.code === PG_STATEMENT_TIMEOUT;
      return NextResponse.json(
        { error: isTimeout ? "Sorgu zaman aşımına uğradı, lütfen tekrar deneyin." : "Failed to fetch request" },
        { status: isTimeout ? 504 : 500 }
      );
    }
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // mukayese_prices, mukayese_items altında nested gelir; consumer'lar için
    // top-level mukayese_request.prices flat array'ine düzleştir.
    const reqAny = request as {
      mukayese_request?: { items?: Array<{ prices?: unknown[] }>; prices?: unknown[] };
      current_revision_cycle?: number;
      approvals?: Array<{ revision_cycle?: number }>;
      all_approvals?: Array<{ revision_cycle?: number }>;
    };
    const m = reqAny.mukayese_request;
    if (m?.items) m.prices = m.items.flatMap((it) => it.prices ?? []);

    // Faz 1 etkinlik logu: tüm cycle'ların onay kayıtlarını "all_approvals"
    // alanında orijinal haliyle bırakıyoruz. Aktif cycle filtresinden önce kopya alındı.
    if (Array.isArray(reqAny.approvals)) {
      reqAny.all_approvals = [...reqAny.approvals];
    }

    // V5: approvals'ı sadece aktif cycle'a filtrele (eski cycle audit için DB'de kalır
    // ama UI'nin "Onay Geçmişi" tablosu yalnız aktif cycle'ı görmeli)
    const activeCycle = reqAny.current_revision_cycle ?? 0;
    if (Array.isArray(reqAny.approvals)) {
      reqAny.approvals = reqAny.approvals.filter(
        (a) => (a.revision_cycle ?? 0) === activeCycle
      );
    }

    return NextResponse.json(request);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
