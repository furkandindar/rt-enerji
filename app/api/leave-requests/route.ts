import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover } from "@/lib/workflow";
import type { CreateLeaveRequestInput } from "@/lib/workflow";

// GET /api/leave-requests - Kullanıcının izin taleplerini listele
export async function GET() {
  try {
    const supabase = await createClient();

    // Mevcut kullanıcının employee_id'sini al
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

    // Kullanıcının taleplerini getir
    const { data: requests, error } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        leave_request:leave_requests(*)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/leave-requests - Yeni izin talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateLeaveRequestInput = await request.json();

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
    const workflowDef = await getWorkflowDefinitionByCode(supabase, body.workflow_code);
    if (!workflowDef) {
      return NextResponse.json({ error: "Invalid workflow code" }, { status: 400 });
    }

    // 3. Ana request kaydını oluştur
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

    // 4. Leave request detaylarını oluştur
    const { error: leaveError } = await supabase
      .from("leave_requests")
      .insert({
        request_id: newRequest.id,
        leave_type: body.leave_type,
        start_datetime: body.start_datetime,
        end_datetime: body.end_datetime,
        total_days: body.total_days,
        address_during_leave: body.address_during_leave || null,
        reason: body.reason || null,
        overtime_amount: body.overtime_amount || null,
      });

    if (leaveError) {
      // Rollback: request'i sil
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating leave request:", leaveError);
      return NextResponse.json({ error: "Failed to create leave details" }, { status: 500 });
    }

    // 5. Approval chain oluştur
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id
      );
    } catch (approvalError) {
      // Rollback: tüm kayıtları sil
      await supabase.from("leave_requests").delete().eq("request_id", newRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", approvalError);
      return NextResponse.json({ 
        error: approvalError instanceof Error ? approvalError.message : "Failed to create approval chain" 
      }, { status: 500 });
    }

    // 6. Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        leave_request:leave_requests(*),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 7. Onaycıya bildirim gönder
    if (createdRequest?.approvals) {
      // Talep edenin adını al
      const { data: requester } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", appUser.employee_id)
        .single();

      const requesterName = requester
        ? `${requester.first_name} ${requester.last_name}`
        : "Bir çalışan";

      // current_step'e göre sıradaki onaycıyı bul
      const currentStep = createdRequest.current_step || 1;

      // Debug log
      console.log("Notification debug:", {
        currentStep,
        approvals: createdRequest.approvals.map((a: { status: string; workflow_step: unknown; approver_employee_id: string }) => ({
          status: a.status,
          workflow_step: a.workflow_step,
          approver_employee_id: a.approver_employee_id
        }))
      });

      const pendingApproval = createdRequest.approvals.find(
        (a: { status: string; workflow_step: { step_order: number } | { step_order: number }[] }) => {
          // workflow_step array veya obje olabilir
          const stepOrder = Array.isArray(a.workflow_step)
            ? a.workflow_step[0]?.step_order
            : a.workflow_step?.step_order;
          return a.status === 'PENDING' && stepOrder === currentStep;
        }
      );

      console.log("Found pending approval:", pendingApproval);

      if (pendingApproval) {
        await notifyApprover(
          supabase,
          pendingApproval.approver_employee_id,
          requesterName,
          newRequest.id,
          workflowDef.name
        );
        console.log("Notification sent to:", pendingApproval.approver_employee_id);
      }
    }

    return NextResponse.json(createdRequest, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

