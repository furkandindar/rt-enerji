import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateSeparationInput } from "@/lib/workflow";

// GET /api/separation - Kullanıcının işten çıkış takip taleplerini listele
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Mevcut kullanıcının employee_id'sini al
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

    // 2. Kullanıcının taleplerini getir
    const { data: requests, error } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        separation_request:separation_requests(*)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    // workflow_code filtresi
    const filtered = (requests || []).filter(
      (r) => r.workflow_definition?.code === "EMPLOYEE_SEPARATION"
    );

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

      const { data: pendingApproval } = await supabase
        .from("request_approvals")
        .select(`
          *,
          workflow_step:workflow_steps(step_order, name)
        `)
        .eq("request_id", newRequest.id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

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

