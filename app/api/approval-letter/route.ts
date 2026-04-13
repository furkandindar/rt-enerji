import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateApprovalLetterInput } from "@/lib/workflow";

// GET /api/approval-letter - Kullanıcının olur yazılarını listele
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
        approval_letter_request:approval_letter_requests(*)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "APPROVAL_LETTER")
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

// POST /api/approval-letter - Yeni olur yazısı oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateApprovalLetterInput = await request.json();

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
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "APPROVAL_LETTER");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // Yetki kontrolü
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // Validasyon
    if (!body.letter_date) {
      return NextResponse.json({ error: "Tarih gerekli" }, { status: 400 });
    }
    if (!body.company?.trim()) {
      return NextResponse.json({ error: "Firma gerekli" }, { status: 400 });
    }
    if (!body.project?.trim()) {
      return NextResponse.json({ error: "Proje gerekli" }, { status: 400 });
    }
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Yazı içeriği gerekli" }, { status: 400 });
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

    // Olur yazısı detaylarını oluştur
    const { error: letterError } = await supabase
      .from("approval_letter_requests")
      .insert({
        request_id: newRequest.id,
        letter_date: body.letter_date,
        company: body.company,
        project: body.project,
        subject: body.subject,
        content: body.content,
        has_payment_table: body.has_payment_table || false,
        comparison_approval_date: body.has_payment_table ? body.comparison_approval_date || null : null,
        agreement_amount: body.has_payment_table ? body.agreement_amount || null : null,
        has_contract: body.has_payment_table ? body.has_contract ?? null : null,
        paid_amounts: body.has_payment_table ? body.paid_amounts || [] : [],
        remaining_payment: body.has_payment_table ? body.remaining_payment || null : null,
        requested_payment_amount: body.has_payment_table ? body.requested_payment_amount || null : null,
        remaining_after_payment: body.has_payment_table ? body.remaining_after_payment || null : null,
      });

    if (letterError) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval letter:", letterError);
      return NextResponse.json({ error: "Failed to create approval letter details" }, { status: 500 });
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
      await supabase.from("approval_letter_requests").delete().eq("request_id", newRequest.id);
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
        approval_letter_request:approval_letter_requests(*),
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
