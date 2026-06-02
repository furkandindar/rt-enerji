import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateOvertimeInput } from "@/lib/workflow";
import { APP_UTC_OFFSET, istanbulInputToTimestamptz } from "@/lib/timezone";

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const WORKFLOW_CODE = "OVERTIME";

// GET /api/overtime
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
        overtime_request:overtime_requests(
          *,
          entries:overtime_entries(*)
        ),
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
      .select("employee_id, role")
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

    // 3. Workflow başlatma yetkisi kontrolü (ORG_ADMIN tümüne erişebilir)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
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
          !body.previous_shift_start_date || !body.previous_shift_start_time ||
          !body.previous_shift_end_date || !body.previous_shift_end_time ||
          !body.next_shift_start_date || !body.next_shift_start_time ||
          !body.next_shift_end_date || !body.next_shift_end_time ||
          !body.work_reason) {
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
      const toTimestamptz = (date: string, time: string) =>
        `${date}T${time}:00${APP_UTC_OFFSET}`;

      overtimeData.work_location = body.work_location;
      overtimeData.work_start_date = istanbulInputToTimestamptz(body.work_start_date);
      overtimeData.work_end_date = istanbulInputToTimestamptz(body.work_end_date);
      overtimeData.previous_shift_start = toTimestamptz(body.previous_shift_start_date, body.previous_shift_start_time);
      overtimeData.previous_shift_end = toTimestamptz(body.previous_shift_end_date, body.previous_shift_end_time);
      overtimeData.next_shift_start = toTimestamptz(body.next_shift_start_date, body.next_shift_start_time);
      overtimeData.next_shift_end = toTimestamptz(body.next_shift_end_date, body.next_shift_end_time);
      overtimeData.work_reason = body.work_reason;
    }

    // STAFF_SHORTAGE için toplam hesapla ve work_location ekle
    if (body.overtime_type === 'STAFF_SHORTAGE') {
      const totalHours = body.entries.reduce((sum, e) => sum + e.overtime_hours, 0);
      const totalPay = body.entries.reduce((sum, e) => sum + e.overtime_pay, 0);
      overtimeData.total_hours = totalHours;
      overtimeData.total_pay = totalPay;
      overtimeData.work_location = body.work_location;
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
        full_name: entry.full_name,
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
