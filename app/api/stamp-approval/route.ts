import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import {
  STAMP_PDF_BUCKET,
  buildOriginalPdfPath,
  parseSelectedPages,
  parseStampPositionFields,
} from "@/lib/stamp-approval/form-fields";

// GET /api/stamp-approval - Kullanıcının kaşeli belge taleplerini listele
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
        stamp_request:stamp_requests(*, stamp:stamps(*))
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .eq("workflow_definition.code", "STAMP_APPROVAL")
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

// POST /api/stamp-approval - Yeni kaşeli belge talebi oluştur
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const formData = await request.formData();

    // FormData'dan alanları al
    const pdfFile = formData.get("pdf_file") as File | null;
    const stampId = formData.get("stamp_id") as string;
    const selectedPages = parseSelectedPages(formData);
    const stampPosition = (formData.get("stamp_position") as string) || "bottom-right";
    const subject = formData.get("subject") as string;
    const description = formData.get("description") as string | null;

    // Serbest konum alanları (opsiyonel) — PATCH ile ortak parse/validasyon
    const positionFields = parseStampPositionFields(formData);
    if (!positionFields.ok) {
      return NextResponse.json({ error: positionFields.error }, { status: 400 });
    }
    const { stampXRatio, stampYRatio, stampPositionOverrides } = positionFields;

    // 1. Kullanıcı doğrulama
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

    // 2. Workflow definition al
    const workflowDef = await getWorkflowDefinitionByCode(supabase, "STAMP_APPROVAL");
    if (!workflowDef) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
    }

    // 3. Yetki kontrolü (ORG_ADMIN tümüne erişebilir)
    const hasPermission = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
    if (!hasPermission) {
      return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });
    }

    // 4. Validasyon
    if (!pdfFile) {
      return NextResponse.json({ error: "PDF dosyası gerekli" }, { status: 400 });
    }
    if (!stampId) {
      return NextResponse.json({ error: "Kaşe seçimi gerekli" }, { status: 400 });
    }
    if (pdfFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Sadece PDF dosyası yüklenebilir" }, { status: 400 });
    }

    // 5. PDF'i Storage'a yükle
    const supabaseAdmin = createServiceRoleClient();
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const originalPdfPath = buildOriginalPdfPath();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STAMP_PDF_BUCKET)
      .upload(originalPdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError);
      return NextResponse.json({ error: "PDF yükleme başarısız" }, { status: 500 });
    }

    // 6. Ana request kaydı oluştur
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
      // Rollback: yüklenen PDF'i sil
      await supabaseAdmin.storage.from(STAMP_PDF_BUCKET).remove([originalPdfPath]);
      return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
    }

    // 7. Stamp request detaylarını oluştur
    const { error: stampError } = await supabase
      .from("stamp_requests")
      .insert({
        request_id: newRequest.id,
        stamp_id: stampId,
        original_pdf_path: originalPdfPath,
        selected_pages: selectedPages,
        stamp_position: stampPosition,
        stamp_x_ratio: stampXRatio,
        stamp_y_ratio: stampYRatio,
        stamp_position_overrides: stampPositionOverrides,
        subject: subject || null,
        description: description || null,
      });

    if (stampError) {
      await supabase.from("requests").delete().eq("id", newRequest.id);
      await supabaseAdmin.storage.from(STAMP_PDF_BUCKET).remove([originalPdfPath]);
      console.error("Error creating stamp request:", stampError);
      return NextResponse.json({ error: "Failed to create stamp request details" }, { status: 500 });
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
      await supabase.from("stamp_requests").delete().eq("request_id", newRequest.id);
      await supabase.from("requests").delete().eq("id", newRequest.id);
      await supabaseAdmin.storage.from(STAMP_PDF_BUCKET).remove([originalPdfPath]);
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
        stamp_request:stamp_requests(*, stamp:stamps(*)),
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
          workflowDef.name,
          subject || undefined
        );
      }
    }

    return NextResponse.json(createdRequest, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

