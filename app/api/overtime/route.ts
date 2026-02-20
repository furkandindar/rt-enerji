import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateOvertimeInput } from "@/lib/workflow";

// GET /api/overtime - Kullanıcının fazla mesai taleplerini listele
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
        overtime_request:overtime_requests(
          *,
          entries:overtime_entries(*)
        )
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "OVERTIME")
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

// POST /api/overtime - Yeni fazla mesai talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateOvertimeInput = await request.json();

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
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "OVERTIME");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Workflow başlatma yetkisi kontrolü
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon
    if (!body.overtime_type || !['EMERGENCY', 'STAFF_SHORTAGE'].includes(body.overtime_type)) {
      return NextResponse.json({ error: "Geçerli bir fazla mesai tipi seçin" }, { status: 400 });
    }
    if (!body.month || !body.year) {
      return NextResponse.json({ error: "Ay ve yıl bilgisi zorunludur" }, { status: 400 });
    }
    if (!body.reason_category) {
      return NextResponse.json({ error: "Neden kategorisi zorunludur" }, { status: 400 });
    }
    if (!body.reason_detail) {
      return NextResponse.json({ error: "Çalışmayı talep eden kişi/durum zorunludur" }, { status: 400 });
    }

    // Tip bazlı validasyon
    if (body.overtime_type === 'EMERGENCY') {
      if (!body.work_location || !body.work_start_date || !body.work_end_date || 
          !body.previous_shift || !body.next_shift || !body.work_reason) {
        return NextResponse.json({ error: "Acil durum için tüm alanlar zorunludur" }, { status: 400 });
      }
    } else if (body.overtime_type === 'STAFF_SHORTAGE') {
      if (!body.entries || body.entries.length === 0) {
        return NextResponse.json({ error: "En az bir çalışan girişi zorunludur" }, { status: 400 });
      }
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

    // 6. Overtime request detaylarını oluştur
    const overtimeData: Record<string, unknown> = {
      request_id: newRequest.id,
      overtime_type: body.overtime_type,
      month: body.month,
      year: body.year,
      reason_category: body.reason_category,
      reason_detail: body.reason_detail,
      hr_note: body.hr_note || null,
    };

    // EMERGENCY alanları
    if (body.overtime_type === 'EMERGENCY') {
      overtimeData.work_location = body.work_location;
      overtimeData.work_start_date = body.work_start_date;
      overtimeData.work_end_date = body.work_end_date;
      overtimeData.previous_shift = body.previous_shift;
      overtimeData.next_shift = body.next_shift;
      overtimeData.work_reason = body.work_reason;
    }

    // STAFF_SHORTAGE için toplam hesapla
    if (body.overtime_type === 'STAFF_SHORTAGE') {
      const totalHours = body.entries.reduce((sum, e) => sum + e.overtime_hours, 0);
      const totalPay = body.entries.reduce((sum, e) => sum + e.overtime_pay, 0);
      overtimeData.total_hours = totalHours;
      overtimeData.total_pay = totalPay;
    }

    const { data: overtimeRequest, error: overtimeError } = await supabase
      .from("overtime_requests")
      .insert(overtimeData)
      .select()
      .single();

    if (overtimeError || !overtimeRequest) {
      // Rollback: request'i sil
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating overtime request:", overtimeError);
      return NextResponse.json({ error: "Failed to create overtime details" }, { status: 500 });
    }

    // 7. STAFF_SHORTAGE için entries oluştur
    if (body.overtime_type === 'STAFF_SHORTAGE' && body.entries.length > 0) {
      const entriesData = body.entries.map(entry => ({
        overtime_request_id: overtimeRequest.id,
        role_title: entry.role_title,
        overtime_hours: entry.overtime_hours,
        overtime_pay: entry.overtime_pay,
      }));

      const { error: entriesError } = await supabase
        .from("overtime_entries")
        .insert(entriesData);

      if (entriesError) {
        // Rollback: tüm kayıtları sil
        await supabase.from("overtime_requests").delete().eq("id", overtimeRequest.id);
        await supabase.from("requests").delete().eq("id", newRequest.id);
        console.error("Error creating overtime entries:", entriesError);
        return NextResponse.json({ error: "Failed to create overtime entries" }, { status: 500 });
      }
    }

    // 8. Approval chain oluştur
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id
      );
    } catch (approvalError) {
      // Rollback: tüm kayıtları sil
      await supabase.from("overtime_entries").delete().eq("overtime_request_id", overtimeRequest.id);
      await supabase.from("overtime_requests").delete().eq("id", overtimeRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", approvalError);
      return NextResponse.json({
        error: approvalError instanceof Error ? approvalError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // 9. Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        overtime_request:overtime_requests(
          *,
          entries:overtime_entries(*)
        ),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // 10. Onaycıya bildirim gönder
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
