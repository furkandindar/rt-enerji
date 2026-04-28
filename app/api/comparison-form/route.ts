import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateMukayeseInput } from "@/lib/workflow";

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
const UNITS = ['ADET', 'SET', 'GUN'] as const;
const ROW_TYPES = ['ITEM', 'SUBTOTAL'] as const;

// GET /api/comparison-form - Kullanıcının mukayese formu taleplerini listele
export async function GET() {
  try {
    const supabase = await createClient();

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

    const { data: requests, error } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        mukayese_request:mukayese_requests(
          *,
          items:mukayese_items(*, prices:mukayese_prices(*)),
          suppliers:mukayese_suppliers(*)
        )
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "COMPARISON_FORM")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching comparison form requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    return NextResponse.json(requests ?? []);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/comparison-form - Yeni mukayese formu talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateMukayeseInput & {
      fx_eur_try?: number | null;
      fx_usd_try?: number | null;
      fx_eur_usd?: number | null;
      fx_snapshot_at?: string | null;
    } = await request.json();

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
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "COMPARISON_FORM");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Yetki kontrolü (is_restricted=false olduğu için herkes)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon - header
    const validationError = validateHeader(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // 5. Validasyon - matris
    const matrixError = validateMatrix(body);
    if (matrixError) return NextResponse.json({ error: matrixError }, { status: 400 });

    // 6. Atomik insert (RPC)
    const { data: newRequestId, error: rpcError } = await supabase.rpc('create_mukayese_request', {
      p_workflow_definition_id: workflowDef.id,
      p_requester_employee_id: appUser.employee_id,
      p_header: {
        project_title: body.project_title,
        form_currency: body.form_currency,
        fx_eur_try: body.fx_eur_try ?? null,
        fx_usd_try: body.fx_usd_try ?? null,
        fx_eur_usd: body.fx_eur_usd ?? null,
        fx_snapshot_at: body.fx_snapshot_at ?? null,
        form_date: body.form_date,
        notes: body.notes ?? null,
        kdv_rate: body.kdv_rate,
        preparer_full_name: body.preparer_full_name,
        company: body.company,
        subject: body.subject,
        request_content: body.request_content,
        request_amount_text: body.request_amount_text,
        request_reason: body.request_reason,
      },
      p_items: body.items,
      p_suppliers: body.suppliers,
      p_prices: body.prices,
    });

    if (rpcError || !newRequestId) {
      console.error("Error creating mukayese request (RPC):", rpcError);
      return NextResponse.json({
        error: rpcError?.message ?? "Failed to create request"
      }, { status: 500 });
    }

    const newRequestIdStr = newRequestId as string;

    // 7. Onay zinciri oluştur
    try {
      await createApprovalChain(
        supabase,
        newRequestIdStr,
        workflowDef.id,
        appUser.employee_id
      );
    } catch (chainError) {
      // Cascade ile mukayese_* alt tabloları otomatik temizlenir
      await supabase.from("requests").delete().eq("id", newRequestIdStr);
      console.error("Error creating approval chain:", chainError);
      return NextResponse.json({
        error: chainError instanceof Error ? chainError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // 8. Detayı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        mukayese_request:mukayese_requests(
          *,
          items:mukayese_items(*, prices:mukayese_prices(*)),
          suppliers:mukayese_suppliers(*)
        ),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequestIdStr)
      .single();

    // 9. İlk onaycıya bildirim
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
          newRequestIdStr,
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


// ============================================================================
// Validasyon Yardımcıları
// ============================================================================

function validateHeader(body: CreateMukayeseInput): string | null {
  if (!body.project_title?.trim()) return "Proje başlığı gerekli";
  if (!CURRENCIES.includes(body.form_currency)) return "Geçersiz para birimi";
  if (!body.form_date) return "Form tarihi gerekli";
  if (typeof body.kdv_rate !== 'number' || body.kdv_rate < 0) return "Geçerli bir KDV oranı girin";
  if (!body.preparer_full_name?.trim()) return "Hazırlayan ad-soyad gerekli";
  if (!body.company?.trim()) return "Firma gerekli";
  if (!body.subject?.trim()) return "Konu gerekli";
  if (!body.request_content?.trim()) return "Talep edilen gerekli";
  if (!body.request_amount_text?.trim()) return "Talep tutarı gerekli";
  if (!body.request_reason?.trim()) return "Talep nedeni gerekli";
  return null;
}

function validateMatrix(body: CreateMukayeseInput): string | null {
  if (!Array.isArray(body.items) || body.items.length === 0) return "En az bir satır eklemelisiniz";
  if (!Array.isArray(body.suppliers) || body.suppliers.length === 0) return "En az bir firma eklemelisiniz";
  if (!Array.isArray(body.prices)) return "Fiyat matrisi geçersiz";

  const itemRowOrders = new Set<number>();
  let hasItemRow = false;
  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    if (typeof it.row_order !== 'number' || it.row_order < 1) {
      return `Satır ${i + 1}: geçerli bir sıra numarası gerekli`;
    }
    if (itemRowOrders.has(it.row_order)) {
      return `Satır sıra numarası tekrar ediyor: ${it.row_order}`;
    }
    itemRowOrders.add(it.row_order);
    if (!ROW_TYPES.includes(it.row_type)) {
      return `Satır ${i + 1}: geçersiz satır türü`;
    }
    if (it.row_type === 'ITEM') {
      hasItemRow = true;
      if (!it.description?.trim()) return `Satır ${i + 1}: açıklama gerekli`;
      if (typeof it.quantity !== 'number' || it.quantity <= 0) return `Satır ${i + 1}: geçerli bir miktar girin`;
      if (!it.unit || !UNITS.includes(it.unit)) return `Satır ${i + 1}: geçerli bir birim seçin`;
    }
  }
  if (!hasItemRow) return "En az bir ürün satırı (ITEM) gerekli";

  const supplierColOrders = new Set<number>();
  for (let i = 0; i < body.suppliers.length; i++) {
    const s = body.suppliers[i];
    if (typeof s.column_order !== 'number' || s.column_order < 1) {
      return `Firma ${i + 1}: geçerli bir sütun numarası gerekli`;
    }
    if (supplierColOrders.has(s.column_order)) {
      return `Firma sütun numarası tekrar ediyor: ${s.column_order}`;
    }
    supplierColOrders.add(s.column_order);
    if (!s.company_name?.trim()) return `Firma ${i + 1}: firma adı gerekli`;
  }

  const cellSeen = new Set<string>();
  for (let i = 0; i < body.prices.length; i++) {
    const p = body.prices[i];
    if (typeof p.row_order !== 'number' || !itemRowOrders.has(p.row_order)) {
      return `Hücre ${i + 1}: geçersiz satır referansı (${p.row_order})`;
    }
    if (typeof p.column_order !== 'number' || !supplierColOrders.has(p.column_order)) {
      return `Hücre ${i + 1}: geçersiz firma referansı (${p.column_order})`;
    }
    const key = `${p.row_order}:${p.column_order}`;
    if (cellSeen.has(key)) return `Hücre tekrar ediyor: satır ${p.row_order}, firma ${p.column_order}`;
    cellSeen.add(key);
    if (typeof p.unit_price !== 'number' || p.unit_price < 0) {
      return `Hücre ${i + 1}: geçerli bir birim fiyat girin`;
    }
  }

  return null;
}
