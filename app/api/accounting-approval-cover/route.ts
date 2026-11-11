import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveApprovalChain, insertApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow, type ResolvedApprovalChain } from "@/lib/workflow";
import { approvalChainErrorResponse, rollbackCreatedRequest } from "@/lib/workflow/request-creation";
import { listDepartmentRequests, listErrorBody, parseListPaging } from "@/lib/department-processes/list-requests";
import type { CreateAccountingApprovalCoverInput } from "@/lib/workflow";
import {
  buildAccountingCoverDetail,
  buildAccountingCoverItems,
  validateAccountingCoverInput,
} from "@/lib/workflow/approval-cover-payload";

const WORKFLOW_CODE = "ACCOUNTING_APPROVAL_COVER";

// GET /api/accounting-approval-cover
//
// Query params:
//   - scope: "mine" (default) → yalnız kendi taleplerim
//            "department" → RLS'in gösterdiği tüm talepler (sunucu canStartWorkflow ile teyit)
//   - status: opsiyonel durum filtresi
//   - page, page_size: opsiyonel sayfalama. Yoksa düz array döner (backwards-compat).
//
// Muhasebe onay kapağı listesi (DepartmentProcessListPage). İki aşamalı, ölçeklenen sorgu:
// lib/department-processes/list-requests.ts (2026-11-11 timeout düzeltmesi).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get("scope") === "department" ? "department" : "mine";
    const status = searchParams.get("status");
    const paging = parseListPaging(searchParams);

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

    const workflowDef = await getWorkflowDefinitionByCode(supabase, WORKFLOW_CODE);
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }
    if (scope === "department") {
      const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
      if (!hasPermission) {
        return NextResponse.json({ error: "Bu süreçleri görüntüleme yetkiniz yok" }, { status: 403 });
      }
    }

    const result = await listDepartmentRequests(supabase, {
      workflowDefinitionId: workflowDef.id,
      scope,
      employeeId: appUser.employee_id,
      status,
      paging,
      relationSelect: "accounting_request:accounting_approval_cover_requests(document_no)",
      context: "accounting-approval-cover",
    });
    if (!result.ok) {
      const err = listErrorBody(result.timeout);
      return NextResponse.json(err.body, { status: err.status });
    }

    if (paging.usePagination) {
      return NextResponse.json({
        items: result.items,
        total: result.total,
        page: paging.page,
        page_size: paging.pageSize,
      });
    }
    return NextResponse.json(result.items);
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

    // 4. Validasyon (başlık + değerlendirme + ödeme tablosu) — PATCH ile ortak
    const validationError = validateAccountingCoverInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Onay zinciri talep kaydından ÖNCE çözülür: onaycısı bulunamayan adım varsa
    // (pozisyon boş vb.) kullanıcı nedenini görür ve hiç kayıt oluşmaz.
    let chain: ResolvedApprovalChain;
    try {
      chain = await resolveApprovalChain(supabase, workflowDef.id, appUser.employee_id, undefined, body.dynamic_approvers);
    } catch (chainError) {
      return approvalChainErrorResponse(chainError, "accounting-approval-cover");
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
        ...buildAccountingCoverDetail(body),
      })
      .select()
      .single();

    if (accountingError || !accountingRequest) {
      await rollbackCreatedRequest(newRequest.id, "accounting-approval-cover");
      console.error("Error creating accounting request:", accountingError);
      return NextResponse.json({ error: "Failed to create accounting details" }, { status: 500 });
    }

    // 9. Ödeme tablosu satırlarını oluştur
    const itemsData = buildAccountingCoverItems(body, accountingRequest.id);

    const { error: itemsError } = await supabase
      .from("accounting_approval_cover_items")
      .insert(itemsData);

    if (itemsError) {
      await rollbackCreatedRequest(newRequest.id, "accounting-approval-cover");
      console.error("Error creating accounting items:", itemsError);
      return NextResponse.json({ error: "Failed to create accounting items" }, { status: 500 });
    }

    // 10. Onay zinciri oluştur (dinamik onaycılar dahil)
    try {
      await insertApprovalChain(supabase, newRequest.id, chain);
    } catch (chainError) {
      await rollbackCreatedRequest(newRequest.id, "accounting-approval-cover");
      return approvalChainErrorResponse(chainError, "accounting-approval-cover");
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
