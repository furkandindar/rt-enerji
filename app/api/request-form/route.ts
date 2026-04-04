import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateRequestFormInput } from "@/lib/workflow";

// GET /api/request-form - Kullanıcının talep formlarını listele
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
        request_form_request:request_form_requests(*)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "REQUEST_FORM")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    const filteredRequests = requests?.filter(r => r.workflow_definition !== null) || [];

    return NextResponse.json(filteredRequests);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/request-form - Yeni talep formu oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateRequestFormInput = await request.json();

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

    // Workflow definition al
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "REQUEST_FORM");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // Yetki kontrolü (ORG_ADMIN tümüne erişebilir)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // Validasyon
    if (!body.requester_name?.trim()) {
      return NextResponse.json({ error: "Talep eden adı soyadı gerekli" }, { status: 400 });
    }
    if (!body.company?.trim()) {
      return NextResponse.json({ error: "Şirket adı gerekli" }, { status: 400 });
    }
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Talep içeriği gerekli" }, { status: 400 });
    }
    if (!body.request_type || !["MUTFAK", "KIRTASIYE", "DIGER"].includes(body.request_type)) {
      return NextResponse.json({ error: "Geçerli bir talep türü seçin" }, { status: 400 });
    }

    // Ana request kaydı oluştur
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

    // Talep formu detaylarını oluştur
    const { error: formError } = await supabase
      .from("request_form_requests")
      .insert({
        request_id: newRequest.id,
        requester_name: body.requester_name,
        company: body.company,
        request_date: body.request_date || new Date().toISOString().split("T")[0],
        subject: body.subject,
        content: body.content,
        quantity: body.quantity || null,
        amount: body.amount || null,
        reason: body.reason || null,
        request_type: body.request_type,
      });

    if (formError) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating request form:", formError);
      return NextResponse.json({ error: "Failed to create request form details" }, { status: 500 });
    }



    // Approval chain oluştur
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id
      );
    } catch (approvalError) {
      await supabase.from("request_form_requests").delete().eq("request_id", newRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", approvalError);
      return NextResponse.json({
        error: approvalError instanceof Error ? approvalError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        request_form_request:request_form_requests(*),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // Onaycıya bildirim gönder
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