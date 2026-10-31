import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveApprovalChain, insertApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow, type ResolvedApprovalChain } from "@/lib/workflow";
import { approvalChainErrorResponse, rollbackCreatedRequest } from "@/lib/workflow/request-creation";
import type { CreateTravelAssignmentInput } from "@/lib/workflow";
import { istanbulInputToTimestamptz } from "@/lib/timezone";

// GET /api/travel-assignment - Kullanıcının görev formlarını listele
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
        travel_assignment_request:travel_assignment_requests(*, company:companies(*))
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "TRAVEL_ASSIGNMENT")
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

// POST /api/travel-assignment - Yeni görev formu oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateTravelAssignmentInput = await request.json();

    // 1. Kullanıcı kontrolü
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

    // 2. Workflow definition
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "TRAVEL_ASSIGNMENT");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Yetki kontrolü
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon
    if (!body.company_id?.trim()) {
      return NextResponse.json({ error: "Şirket seçimi gerekli" }, { status: 400 });
    }
    if (!body.assignment_subject?.trim()) {
      return NextResponse.json({ error: "Görev konusu gerekli" }, { status: 400 });
    }
    if (!body.destination_city?.trim()) {
      return NextResponse.json({ error: "Görev şehri gerekli" }, { status: 400 });
    }
    if (!body.destination_institution?.trim()) {
      return NextResponse.json({ error: "Görev kurumu gerekli" }, { status: 400 });
    }
    if (!body.estimated_departure_at) {
      return NextResponse.json({ error: "Tahmini çıkış tarihi gerekli" }, { status: 400 });
    }
    if (!body.estimated_return_at) {
      return NextResponse.json({ error: "Tahmini dönüş tarihi gerekli" }, { status: 400 });
    }
    if (!body.transportation_type || !["COMPANY_VEHICLE", "RENTAL_VEHICLE", "AIRPLANE", "OTHER"].includes(body.transportation_type)) {
      return NextResponse.json({ error: "Geçerli bir ulaşım aracı seçin" }, { status: 400 });
    }

    // Onay zincirleri talep kaydından ÖNCE çözülür: onaycısı bulunamayan adım varsa
    // (pozisyon boş vb.) kullanıcı nedenini görür ve hiç kayıt oluşmaz. Avans
    // istendiyse bağlı Talep Formu zinciri de burada çözülür; aksi halde görev formu
    // oluşup avans talebi onay satırsız kalabilirdi.
    const requestFormDef = body.advance_requested
      ? await getWorkflowDefinitionByCode(supabase, "REQUEST_FORM")
      : null;
    let chain: ResolvedApprovalChain;
    let advanceChain: ResolvedApprovalChain | null = null;
    try {
      chain = await resolveApprovalChain(
        supabase,
        workflowDef.id,
        appUser.employee_id,
        { advance_requested: body.advance_requested || false }  // V4: koşullu adım kontrolü
      );
      if (requestFormDef) {
        advanceChain = await resolveApprovalChain(supabase, requestFormDef.id, appUser.employee_id);
      }
    } catch (chainError) {
      return approvalChainErrorResponse(chainError, "travel-assignment");
    }

    // 5. Ana request kaydı oluştur
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

    // 6. Görev formu detaylarını oluştur
    const { error: travelError } = await supabase
      .from("travel_assignment_requests")
      .insert({
        request_id: newRequest.id,
        company_id: body.company_id,
        assignment_subject: body.assignment_subject,
        destination_city: body.destination_city,
        destination_institution: body.destination_institution,
        estimated_departure_at: istanbulInputToTimestamptz(body.estimated_departure_at),
        estimated_return_at: istanbulInputToTimestamptz(body.estimated_return_at),
        transportation_type: body.transportation_type,
        transportation_cost: body.transportation_cost || 0,
        accommodation_needed: body.accommodation_needed || false,
        accommodation_cost: body.accommodation_cost || 0,
        advance_requested: body.advance_requested || false,
      });

    if (travelError) {
      await rollbackCreatedRequest(newRequest.id, "travel-assignment");
      console.error("Error creating travel assignment request:", travelError);
      return NextResponse.json({ error: "Failed to create travel assignment details" }, { status: 500 });
    }

    // 7. Onay zincirini yaz (yukarıda formData ile çözüldü)
    try {
      await insertApprovalChain(supabase, newRequest.id, chain);
    } catch (chainError) {
      // Rollback: request ve travel_assignment_request sil
      await rollbackCreatedRequest(newRequest.id, "travel-assignment");
      return approvalChainErrorResponse(chainError, "travel-assignment");
    }

    // 8. İlk onaycıya bildirim gönder (ilk adım auto-approve ise sonraki PENDING adıma)
    try {
      const { data: updatedRequest } = await supabase
        .from("requests")
        .select("current_step")
        .eq("id", newRequest.id)
        .single();

      const currentStep = updatedRequest?.current_step || 1;

      const { data: nextApproval } = await supabase
        .from("request_approvals")
        .select("approver_employee_id")
        .eq("request_id", newRequest.id)
        .eq("status", "PENDING")
        .eq("sequence_order", currentStep)
        .maybeSingle();

      if (nextApproval) {
        const { data: requester } = await supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", appUser.employee_id)
          .single();

        const requesterName = requester
          ? `${requester.first_name} ${requester.last_name}`
          : "Bir çalışan";

        await notifyApprover(
          supabase,
          nextApproval.approver_employee_id,
          requesterName,
          newRequest.id,
          "Şehir İçi/Dışı Görev Formu"
        );
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
      // Bildirim hatası süreci durdurmamalı
    }

    // 9. Avans talebi varsa REQUEST_FORM workflow'u tetikle (zinciri yukarıda çözüldü)
    if (body.advance_requested) {
      try {
        if (requestFormDef && advanceChain) {
          // Çalışan adı ve şirket adını al
          const [{ data: employee }, { data: company }] = await Promise.all([
            supabase
              .from("employees")
              .select("first_name, last_name")
              .eq("id", appUser.employee_id)
              .single(),
            supabase
              .from("companies")
              .select("name")
              .eq("id", body.company_id)
              .single(),
          ]);

          const requesterName = employee
            ? `${employee.first_name} ${employee.last_name}`
            : "";

          // Alt talep oluştur
          const { data: advanceRequest, error: advanceError } = await supabase
            .from("requests")
            .insert({
              workflow_definition_id: requestFormDef.id,
              requester_employee_id: appUser.employee_id,
              parent_request_id: newRequest.id,  // V4: görev formuna bağla
              status: "PENDING",
              current_step: 1,
              submitted_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (advanceError || !advanceRequest) {
            console.error("Error creating linked advance request:", advanceError);
            // Ana süreç devam eder, avans oluşturulamazsa logluyoruz
          } else {
            // Talep formu detaylarını oluştur (görev formundan gelen değerlerle)
            const { error: advanceDetailError } = await supabase
              .from("request_form_requests")
              .insert({
                request_id: advanceRequest.id,
                requester_name: requesterName,
                company: company?.name || "",
                request_date: new Date().toISOString().split("T")[0],
                subject: body.advance_subject || "",
                content: body.advance_content || "",
                amount: body.advance_amount || null,
                request_type: "DIGER",
              });

            if (advanceDetailError) {
              console.error("Error creating advance details:", advanceDetailError);
              await rollbackCreatedRequest(advanceRequest.id, "travel-assignment/advance");
            } else {
              // Avans onay zinciri — yazılamazsa avans talebi onay satırsız kalmasın
              try {
                await insertApprovalChain(supabase, advanceRequest.id, advanceChain);
              } catch (advanceChainError) {
                console.error("Error creating advance approval chain:", advanceChainError);
                await rollbackCreatedRequest(advanceRequest.id, "travel-assignment/advance");
              }
            }
          }
        }
      } catch (advError) {
        console.error("Error creating linked advance request:", advError);
        // Ana süreç devam eder
      }
    }

    return NextResponse.json(newRequest, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
