import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateFinanceApprovalCoverInput } from "@/lib/workflow";

const EXPENSE_AREAS = ['ANA_SAHA', 'ELEKTRIKSEL_KAPASITE_ARTISI', 'YEKA'] as const;
const FUNDING_SOURCES = ['KREDI', 'OZ_KAYNAK', 'NAKIT_FAZLASI', 'DIGER'] as const;

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const WORKFLOW_CODE = "FINANCE_APPROVAL_COVER";

// GET /api/finance-approval-cover
//
// Query params:
//   - scope: "mine" (default) → sadece kendi taleplerim
//            "department" → workflow_initiators kuralına uyanların görebileceği
//                          tüm talepler (RLS halleder; sunucu canStartWorkflow ile teyit)
//   - status: opsiyonel durum filtresi
//   - page, page_size: opsiyonel sayfalama. Yoksa düz array döner (backwards-compat).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const scope = searchParams.get("scope") === "department" ? "department" : "mine";
    const status = searchParams.get("status");
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("page_size");
    const usePagination = pageParam !== null || pageSizeParam !== null;

    const pageSize = (() => {
      const n = Number(pageSizeParam);
      return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
    })();
    const page = (() => {
      const n = Number(pageParam);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    })();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    if (scope === "department") {
      const workflowDef = await getWorkflowDefinitionByCode(supabase, WORKFLOW_CODE);
      if (!workflowDef) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
      }
      const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
      if (!hasPermission) {
        return NextResponse.json({ error: "Bu süreçleri görüntüleme yetkiniz yok" }, { status: 403 });
      }
    }

    let query = supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions!inner(id, code, name),
        finance_request:finance_approval_cover_requests(
          *,
          items:finance_approval_cover_items(*)
        ),
        requester:employees!requester_employee_id(id, first_name, last_name, employee_no)
      `, usePagination ? { count: "exact" } : {})
      .eq("workflow_definition.code", WORKFLOW_CODE)
      .order("created_at", { ascending: false });

    if (scope === "mine") {
      query = query.eq("requester_employee_id", appUser.employee_id);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (usePagination) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data: requests, error, count } = await query;

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    const filtered = requests?.filter(r => r.workflow_definition !== null) || [];

    if (usePagination) {
      return NextResponse.json({
        items: filtered,
        total: count ?? 0,
        page,
        page_size: pageSize,
      });
    }
    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/finance-approval-cover - Yeni onay kapağı talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateFinanceApprovalCoverInput = await request.json();

    // 1. Kullanıcı kontrolü
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // 2. Workflow definition
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "FINANCE_APPROVAL_COVER");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Yetki kontrolü (Finans departmanı + ORG_ADMIN)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon - başlık alanları
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }
    if (!body.document_no?.trim()) {
      return NextResponse.json({ error: "Sayı gerekli" }, { status: 400 });
    }
    if (!body.request_date) {
      return NextResponse.json({ error: "Tarih gerekli" }, { status: 400 });
    }
    if (typeof body.account_available !== 'boolean') {
      return NextResponse.json({ error: "Hesap durumu bilgisi gerekli" }, { status: 400 });
    }
    if (typeof body.cash_flow_recorded !== 'boolean') {
      return NextResponse.json({ error: "Nakit giriş/çıkış kaydı bilgisi gerekli" }, { status: 400 });
    }
    if (typeof body.has_rt_enerji_proforma !== 'boolean') {
      return NextResponse.json({ error: "RT Enerji proforma bilgisi gerekli" }, { status: 400 });
    }
    if (!EXPENSE_AREAS.includes(body.expense_area)) {
      return NextResponse.json({ error: "Geçerli bir harcama alanı seçin" }, { status: 400 });
    }
    if (!FUNDING_SOURCES.includes(body.funding_source)) {
      return NextResponse.json({ error: "Geçerli bir niteliği seçin" }, { status: 400 });
    }

    // 5. Validasyon - ödeme tablosu
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "En az bir ödeme satırı zorunludur" }, { status: 400 });
    }
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i];
      if (!it.item_date) {
        return NextResponse.json({ error: `Satır ${i + 1}: tarih gerekli` }, { status: 400 });
      }
      if (!it.company_name?.trim()) {
        return NextResponse.json({ error: `Satır ${i + 1}: firma adı gerekli` }, { status: 400 });
      }
      if (!it.payee_name?.trim()) {
        return NextResponse.json({ error: `Satır ${i + 1}: ödeme yapılacak firma/kurum gerekli` }, { status: 400 });
      }
      if (!it.item_subject?.trim()) {
        return NextResponse.json({ error: `Satır ${i + 1}: konu gerekli` }, { status: 400 });
      }
      if (typeof it.invoice_amount !== 'number' || it.invoice_amount < 0) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir fatura tutarı girin` }, { status: 400 });
      }
      if (typeof it.payable_amount !== 'number' || it.payable_amount < 0) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir ödenecek tutar girin` }, { status: 400 });
      }
    }

    // 6. Ana request kaydı oluştur
    const { data: newRequest, error: requestError } = await supabase
      .from("requests")
      .insert({
        workflow_definition_id: workflowDef.id,
        requester_employee_id: appUser.employee_id,
        status: "PENDING",
        current_step: 1,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (requestError || !newRequest) {
      console.error("Error creating request:", requestError);
      return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
    }

    // 7. Ana finans kaydı oluştur
    const { data: financeRequest, error: financeError } = await supabase
      .from("finance_approval_cover_requests")
      .insert({
        request_id: newRequest.id,
        subject: body.subject,
        request_date: body.request_date,
        document_no: body.document_no,
        account_available: body.account_available,
        cash_flow_recorded: body.cash_flow_recorded,
        expense_area: body.expense_area,
        funding_source: body.funding_source,
        has_rt_enerji_proforma: body.has_rt_enerji_proforma,
      })
      .select()
      .single();

    if (financeError || !financeRequest) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating finance request:", financeError);
      return NextResponse.json({ error: "Failed to create finance details" }, { status: 500 });
    }

    // 8. Ödeme tablosu satırlarını oluştur
    const itemsData = body.items.map((it, idx) => ({
      finance_request_id: financeRequest.id,
      row_order: idx + 1,
      item_date: it.item_date,
      company_name: it.company_name,
      payee_name: it.payee_name,
      item_subject: it.item_subject,
      invoice_amount: it.invoice_amount,
      payable_amount: it.payable_amount,
    }));

    const { error: itemsError } = await supabase
      .from("finance_approval_cover_items")
      .insert(itemsData);

    if (itemsError) {
      await supabase.from("finance_approval_cover_requests").delete().eq("id", financeRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating finance items:", itemsError);
      return NextResponse.json({ error: "Failed to create finance items" }, { status: 500 });
    }

    // 9. Onay zinciri oluştur (dinamik onaycılar dahil)
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id,
        undefined,
        body.dynamic_approvers
      );
    } catch (chainError) {
      await supabase.from("finance_approval_cover_items").delete().eq("finance_request_id", financeRequest.id);
      await supabase.from("finance_approval_cover_requests").delete().eq("id", financeRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", chainError);
      return NextResponse.json({
        error: chainError instanceof Error ? chainError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // 10. Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        finance_request:finance_approval_cover_requests(
          *,
          items:finance_approval_cover_items(*)
        ),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 11. İlk onaycıya bildirim gönder
    if (createdRequest?.approvals) {
      const { data: requester } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", appUser.employee_id)
        .single();

      const requesterName = requester
        ? `${requester.first_name} ${requester.last_name}`
        : "Bir çalışan";

      const currentStep = createdRequest.current_step || 1;
      const pendingApproval = createdRequest.approvals.find(
        (a: { status: string; sequence_order: number }) =>
          a.status === 'PENDING' && a.sequence_order === currentStep
      );

      if (pendingApproval) {
        await notifyApprover(
          supabase,
          pendingApproval.approver_employee_id,
          requesterName,
          newRequest.id,
          workflowDef.name
        );
      }
    }

    return NextResponse.json(createdRequest, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
