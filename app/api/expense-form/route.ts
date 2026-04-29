import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateExpenseFormInput } from "@/lib/workflow";

// GET /api/expense-form - Kullanıcının harcama formu taleplerini listele
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
        expense_request:expense_requests(
          *,
          items:expense_items(*)
        )
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "EXPENSE_FORM")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    const filtered = requests?.filter(r => r.workflow_definition !== null) || [];
    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/expense-form - Yeni harcama formu talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateExpenseFormInput = await request.json();

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

    const workflowDef = await getWorkflowDefinitionByCode(supabase, "EXPENSE_FORM");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // Başlık validasyonu
    if (!body.request_date) {
      return NextResponse.json({ error: "Tarih gerekli" }, { status: 400 });
    }
    if (!body.project_name?.trim()) {
      return NextResponse.json({ error: "Proje adı gerekli" }, { status: 400 });
    }
    if (!body.project_code?.trim()) {
      return NextResponse.json({ error: "Proje kodu gerekli" }, { status: 400 });
    }
    if (!body.work_or_destination?.trim()) {
      return NextResponse.json({
        error: body.is_travel ? "Seyahat yapılan yer gerekli" : "İşin adı gerekli",
      }, { status: 400 });
    }
    if (typeof body.is_travel !== 'boolean') {
      return NextResponse.json({ error: "Harcama tipi seçimi gerekli" }, { status: 400 });
    }
    if (body.travel_person_count !== undefined && body.travel_person_count !== null) {
      if (!Number.isInteger(body.travel_person_count) || body.travel_person_count <= 0) {
        return NextResponse.json({ error: "Geçerli bir kişi sayısı girin" }, { status: 400 });
      }
    }
    if (body.advance_amount !== undefined && body.advance_amount !== null) {
      if (typeof body.advance_amount !== 'number' || body.advance_amount < 0) {
        return NextResponse.json({ error: "Geçerli bir avans tutarı girin" }, { status: 400 });
      }
    }

    // Kalem validasyonu
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "En az bir harcama satırı zorunludur" }, { status: 400 });
    }
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i];
      if (!it.item_date) {
        return NextResponse.json({ error: `Satır ${i + 1}: tarih gerekli` }, { status: 400 });
      }
      if (!it.description?.trim()) {
        return NextResponse.json({ error: `Satır ${i + 1}: açıklama gerekli` }, { status: 400 });
      }
      if (typeof it.amount !== 'number' || it.amount < 0) {
        return NextResponse.json({ error: `Satır ${i + 1}: geçerli bir tutar girin` }, { status: 400 });
      }
    }

    // Ana request kaydı
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


    // Ana harcama kaydı
    const { data: expenseRequest, error: expenseError } = await supabase
      .from("expense_requests")
      .insert({
        request_id: newRequest.id,
        request_date: body.request_date,
        project_name: body.project_name,
        project_code: body.project_code,
        is_travel: body.is_travel,
        work_or_destination: body.work_or_destination,
        travel_person_count: body.is_travel ? (body.travel_person_count ?? null) : null,
        travel_date: body.is_travel ? (body.travel_date ?? null) : null,
        travel_duration: body.is_travel ? (body.travel_duration ?? null) : null,
        advance_amount: body.advance_amount ?? null,
      })
      .select()
      .single();

    if (expenseError || !expenseRequest) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating expense request:", expenseError);
      return NextResponse.json({ error: "Failed to create expense details" }, { status: 500 });
    }

    // Harcama kalemleri
    const itemsData = body.items.map((it, idx) => ({
      expense_request_id: expenseRequest.id,
      row_order: idx + 1,
      item_date: it.item_date,
      document_no: it.document_no?.trim() ? it.document_no.trim() : null,
      description: it.description,
      amount: it.amount,
    }));

    const { error: itemsError } = await supabase
      .from("expense_items")
      .insert(itemsData);

    if (itemsError) {
      await supabase.from("expense_requests").delete().eq("id", expenseRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating expense items:", itemsError);
      return NextResponse.json({ error: "Failed to create expense items" }, { status: 500 });
    }

    // Onay zinciri
    try {
      await createApprovalChain(
        supabase,
        newRequest.id,
        workflowDef.id,
        appUser.employee_id,
      );
    } catch (chainError) {
      await supabase.from("expense_items").delete().eq("expense_request_id", expenseRequest.id);
      await supabase.from("expense_requests").delete().eq("id", expenseRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      console.error("Error creating approval chain:", chainError);
      return NextResponse.json({
        error: chainError instanceof Error ? chainError.message : "Failed to create approval chain"
      }, { status: 500 });
    }

    // Oluşturulan talebi detaylı getir
    const { data: createdRequest } = await supabase
      .from("requests")
      .select(`
        *,
        workflow_definition:workflow_definitions(id, code, name),
        expense_request:expense_requests(
          *,
          items:expense_items(*)
        ),
        approvals:request_approvals(
          *,
          workflow_step:workflow_steps(*)
        )
      `)
      .eq("id", newRequest.id)
      .single();

    // İlk onaycıya bildirim
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
