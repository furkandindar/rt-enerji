import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveApprovalChain, insertApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow, type ResolvedApprovalChain } from "@/lib/workflow";
import { approvalChainErrorResponse, rollbackCreatedRequest } from "@/lib/workflow/request-creation";
import { listDepartmentRequests, listErrorBody, parseListPaging } from "@/lib/department-processes/list-requests";
import type { CreateSeparationInput } from "@/lib/workflow";

const WORKFLOW_CODE = "EMPLOYEE_SEPARATION";

// GET /api/separation
//
// Query params:
//   - scope: "mine" (default) → yalnız kendi taleplerim
//            "department" → RLS'in gösterdiği tüm talepler (sunucu canStartWorkflow ile teyit)
//   - status: opsiyonel durum filtresi
//   - page, page_size: opsiyonel sayfalama. Yoksa düz array döner (backwards-compat).
//
// İşten çıkış takip listesi (DepartmentProcessListPage). İki aşamalı, ölçeklenen sorgu:
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
      context: "separation",
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

// POST /api/separation - Yeni işten çıkış takip talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateSeparationInput = await request.json();

    // 1. Mevcut kullanıcının employee_id'sini al
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

    // 2. Workflow definition'ı al
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "EMPLOYEE_SEPARATION");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Workflow başlatma yetkisi kontrolü (ORG_ADMIN tümüne erişebilir)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon
    if (!body.employee_name?.trim()) {
      return NextResponse.json({ error: "Ayrılan kişinin adı zorunludur" }, { status: 400 });
    }
    if (!body.separation_date) {
      return NextResponse.json({ error: "İşten çıkış tarihi zorunludur" }, { status: 400 });
    }

    // Onay zinciri talep kaydından ÖNCE çözülür: onaycısı bulunamayan adım varsa
    // (pozisyon boş vb.) kullanıcı nedenini görür ve hiç kayıt oluşmaz.
    let chain: ResolvedApprovalChain;
    try {
      chain = await resolveApprovalChain(supabase, workflowDef.id, appUser.employee_id);
    } catch (chainError) {
      return approvalChainErrorResponse(chainError, "separation");
    }

    // 5. Ana request kaydını oluştur
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

    // 6. Separation request detaylarını oluştur (section 1 alanları)
    const { error: separationError } = await supabase
      .from("separation_requests")
      .insert({
        request_id: newRequest.id,
        employee_name: body.employee_name,
        employee_title: body.employee_title,
        department: body.department,
        location: body.location,
        job_description: body.job_description,
        reporting_manager: body.reporting_manager,
        separation_date: body.separation_date,
        separation_reason: body.separation_reason,
        employment_period: body.employment_period,
        annual_leave_days: body.annual_leave_days ?? 0,
        annual_leave_amount: body.annual_leave_amount ?? 0,
        severance_days: body.severance_days ?? 0,
        severance_amount: body.severance_amount ?? 0,
        notice_weeks: body.notice_weeks ?? 0,
        notice_amount: body.notice_amount ?? 0,
      });

    if (separationError) {
      // Rollback: request'i sil
      await rollbackCreatedRequest(newRequest.id, "separation");
      console.error("Error creating separation request:", separationError);
      return NextResponse.json({ error: "Failed to create separation details" }, { status: 500 });
    }

    // 7. Approval chain oluştur
    try {
      await insertApprovalChain(supabase, newRequest.id, chain);
    } catch (approvalError) {
      // Rollback
      await rollbackCreatedRequest(newRequest.id, "separation");
      return approvalChainErrorResponse(approvalError, "separation");
    }

    // 8. Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        separation_request:separation_requests(*),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 9. İlk onaycıya bildirim gönder (eğer step 1 auto-approved ise step 2 onaycısına)
    try {
      // Requester adını çek
      const { data: requesterEmployee } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", appUser.employee_id)
        .single();

      const requesterName = requesterEmployee
        ? `${requesterEmployee.first_name} ${requesterEmployee.last_name}`
        : "Bir çalışan";

      const currentStep = createdRequest?.current_step || 1;

      const { data: pendingApproval } = await supabase
        .from("request_approvals")
        .select("approver_employee_id")
        .eq("request_id", newRequest.id)
        .eq("status", "PENDING")
        .eq("sequence_order", currentStep)
        .maybeSingle();

      if (pendingApproval) {
        await notifyApprover(
          supabase,
          pendingApproval.approver_employee_id,
          requesterName,
          newRequest.id,
          workflowDef.name
        );
      }
    } catch (notifyError) {
      console.error("Error sending notification:", notifyError);
    }

    return NextResponse.json(createdRequest, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

