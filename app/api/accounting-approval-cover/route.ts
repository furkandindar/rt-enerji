import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateAccountingApprovalCoverInput } from "@/lib/workflow";

const CAPACITY_TYPES = ['KAPASITE', 'ANASAHA', 'YEKA'] as const;
const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const WORKFLOW_CODE = "ACCOUNTING_APPROVAL_COVER";

// GET /api/accounting-approval-cover
//
// Query params:
//   - scope: "mine" (default) | "department"
//   - status: opsiyonel
//   - page, page_size: opsiyonel sayfalama. Yoksa düz array döner.
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
        accounting_request:accounting_approval_cover_requests(
          *,
          items:accounting_approval_cover_items(*)
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

// POST /api/accounting-approval-cover - Yeni muhasebe onay kapağı talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateAccountingApprovalCoverInput = await request.json();

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
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "ACCOUNTING_APPROVAL_COVER");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Yetki kontrolü (Muhasebe departmanı + ORG_ADMIN)
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

    // 5. Validasyon - değerlendirme alanları (hepsi zorunlu boolean)
    const booleanFields: Array<[keyof CreateAccountingApprovalCoverInput, string]> = [
      ['demirbas_registered', 'Demirbaş kaydı bilgisi gerekli'],
      ['has_dispatch_note', 'İrsaliye bilgisi gerekli'],
      ['has_delivery_info', 'Teslim alan/eden bilgisi gerekli'],
      ['has_invoice_record', 'Fatura kaydı bilgisi gerekli'],
      ['has_accounting_prog_entry', 'Muhasebe programı bilgisi gerekli'],
      ['has_arvento_record', 'Arvento kaydı bilgisi gerekli'],
      ['paid_from_credit', 'Krediden ödeme bilgisi gerekli'],
    ];
    for (const [field, message] of booleanFields) {
      if (typeof body[field] !== 'boolean') {
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // 6. Validasyon - ödeme tablosu
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
      if (!CAPACITY_TYPES.includes(it.capacity_type)) {
        return NextResponse.json({ error: `Satır ${i + 1}: kapasite tipi seçin` }, { status: 400 });
      }
      if (typeof it.invoice_amount !== 'number' || it.invoice_amount < 0) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir fatura tutarı girin` }, { status: 400 });
      }
      if (typeof it.payable_amount !== 'number' || it.payable_amount < 0) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir ödenecek tutar girin` }, { status: 400 });
      }
      if (!CURRENCIES.includes(it.currency)) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir para birimi seçin` }, { status: 400 });
      }
    }


    // 7. Ana request kaydı oluştur
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

    // 8. Ana muhasebe kaydı oluştur
    const { data: accountingRequest, error: accountingError } = await supabase
      .from("accounting_approval_cover_requests")
      .insert({
        request_id: newRequest.id,
        subject: body.subject,
        request_date: body.request_date,
        document_no: body.document_no,
        demirbas_registered: body.demirbas_registered,
        has_dispatch_note: body.has_dispatch_note,
        has_delivery_info: body.has_delivery_info,
        has_invoice_record: body.has_invoice_record,
        has_accounting_prog_entry: body.has_accounting_prog_entry,
        has_arvento_record: body.has_arvento_record,
        paid_from_credit: body.paid_from_credit,
      })
      .select()
      .single();

    if (accountingError || !accountingRequest) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating accounting request:", accountingError);
      return NextResponse.json({ error: "Failed to create accounting details" }, { status: 500 });
    }

    // 9. Ödeme tablosu satırlarını oluştur
    const itemsData = body.items.map((it, idx) => ({
      accounting_request_id: accountingRequest.id,
      row_order: idx + 1,
      item_date: it.item_date,
      company_name: it.company_name,
      payee_name: it.payee_name,
      item_subject: it.item_subject,
      capacity_type: it.capacity_type,
      invoice_amount: it.invoice_amount,
      payable_amount: it.payable_amount,
      currency: it.currency,
    }));

    const { error: itemsError } = await supabase
      .from("accounting_approval_cover_items")
      .insert(itemsData);

    if (itemsError) {
      await supabase.from("accounting_approval_cover_requests").delete().eq("id", accountingRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating accounting items:", itemsError);
      return NextResponse.json({ error: "Failed to create accounting items" }, { status: 500 });
    }

    // 10. Onay zinciri oluştur (dinamik onaycılar dahil)
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
      await supabase.from("accounting_approval_cover_items").delete().eq("accounting_request_id", accountingRequest.id);
      await supabase.from("accounting_approval_cover_requests").delete().eq("id", accountingRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", chainError);
      return NextResponse.json({
        error: chainError instanceof Error ? chainError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // 11. Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        accounting_request:accounting_approval_cover_requests(
          *,
          items:accounting_approval_cover_items(*)
        ),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 12. İlk onaycıya bildirim gönder
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
