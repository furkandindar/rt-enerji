import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateOnboardingInput } from "@/lib/workflow";

// GET /api/onboarding - Kullanıcının işe giriş takip taleplerini listele
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
        onboarding_request:onboarding_requests(*)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "EMPLOYEE_ONBOARDING")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    // workflow_definition null olanları filtrele (code eşleşmeyenler)
    const filteredRequests = requests?.filter(r => r.workflow_definition !== null) || [];

    return NextResponse.json(filteredRequests);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/onboarding - Yeni işe giriş takip talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateOnboardingInput = await request.json();

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

    // 2. Workflow definition'ı al
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "EMPLOYEE_ONBOARDING");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Workflow başlatma yetkisi kontrolü
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon
    if (!body.employee_name?.trim()) {
      return NextResponse.json({ error: "İşe başlayacak kişinin adı zorunludur" }, { status: 400 });
    }
    if (!body.start_date) {
      return NextResponse.json({ error: "İşe giriş tarihi zorunludur" }, { status: 400 });
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

    // 6. Onboarding request detaylarını oluştur (sadece section 1 alanları)
    const { error: onboardingError } = await supabase
      .from("onboarding_requests")
      .insert({
        request_id: newRequest.id,
        employee_name: body.employee_name,
        employee_title: body.employee_title,
        department: body.department,
        location: body.location,
        job_description: body.job_description,
        reporting_manager: body.reporting_manager,
        start_date: body.start_date,
        employment_period: body.employment_period,
      });

    if (onboardingError) {
      // Rollback: request'i sil
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating onboarding request:", onboardingError);
      return NextResponse.json({ error: "Failed to create onboarding details" }, { status: 500 });
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
      // Rollback: tüm kayıtları sil
      await supabase.from("onboarding_requests").delete().eq("request_id", newRequest.id);
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
        onboarding_request:onboarding_requests(*),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 9. Onaycıya bildirim gönder
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
        (a: { status: string; workflow_step: { step_order: number } | { step_order: number }[] }) => {
          const stepOrder = Array.isArray(a.workflow_step)
            ? a.workflow_step[0]?.step_order
            : a.workflow_step?.step_order;
          return a.status === 'PENDING' && stepOrder === currentStep;
        }
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

