import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateSeparationInput } from "@/lib/workflow";

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const WORKFLOW_CODE = "EMPLOYEE_SEPARATION";

// GET /api/separation
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
        separation_request:separation_requests(*),
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
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating separation request:", separationError);
      return NextResponse.json({ error: "Failed to create separation details" }, { status: 500 });
    }

    // 7. Approval chain oluştur
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id
      );
    } catch (approvalError) {
      // Rollback
      await supabase.from("separation_requests").delete().eq("request_id", newRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", approvalError);
      return NextResponse.json({
        error: approvalError instanceof Error ? approvalError.message : "Failed to create approval chain"
      }, { status: 500 });
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

