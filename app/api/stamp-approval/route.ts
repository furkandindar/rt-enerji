import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";

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
    const selectedPages = (formData.get("selected_pages") as string) || "all";
    const stampPosition = (formData.get("stamp_position") as string) || "bottom-right";
    const subject = formData.get("subject") as string;
    const description = formData.get("description") as string | null;

    // Serbest konum alanları (opsiyonel)
    const xRatioRaw = formData.get("stamp_x_ratio") as string | null;
    const yRatioRaw = formData.get("stamp_y_ratio") as string | null;
    const overridesRaw = formData.get("stamp_position_overrides") as string | null;

    let stampXRatio: number | null = null;
    let stampYRatio: number | null = null;

    if (xRatioRaw && yRatioRaw) {
      const xNum = parseFloat(xRatioRaw);
      const yNum = parseFloat(yRatioRaw);
      if (!Number.isFinite(xNum) || xNum < 0 || xNum > 1) {
        return NextResponse.json({ error: "stamp_x_ratio 0-1 arasında bir sayı olmalı" }, { status: 400 });
      }
      if (!Number.isFinite(yNum) || yNum < 0 || yNum > 1) {
        return NextResponse.json({ error: "stamp_y_ratio 0-1 arasında bir sayı olmalı" }, { status: 400 });
      }
      stampXRatio = xNum;
      stampYRatio = yNum;
    } else if (xRatioRaw || yRatioRaw) {
      return NextResponse.json({ error: "stamp_x_ratio ve stamp_y_ratio birlikte gönderilmeli" }, { status: 400 });
    }

    // Override map'i tolerantla parse et: geçersiz girişler sessizce atılır
    let stampPositionOverrides: Record<string, { x: number; y: number }> | null = null;
    if (overridesRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(overridesRaw);
      } catch {
        return NextResponse.json({ error: "stamp_position_overrides geçerli JSON olmalı" }, { status: 400 });
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const cleaned: Record<string, { x: number; y: number }> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const pageNum = Number(key);
          if (!Number.isInteger(pageNum) || pageNum < 1) continue;
          if (!value || typeof value !== "object") continue;
          const v = value as { x?: unknown; y?: unknown };
          const xn = typeof v.x === "number" ? v.x : NaN;
          const yn = typeof v.y === "number" ? v.y : NaN;
          if (!Number.isFinite(xn) || xn < 0 || xn > 1) continue;
          if (!Number.isFinite(yn) || yn < 0 || yn > 1) continue;
          cleaned[String(pageNum)] = { x: xn, y: yn };
        }
        stampPositionOverrides = Object.keys(cleaned).length > 0 ? cleaned : null;
      }
    }

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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const originalFileName = `stamp_${Date.now()}_original.pdf`;
    const originalPdfPath = `${year}/${month}/${originalFileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("request-documents")
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
      await supabaseAdmin.storage.from("request-documents").remove([originalPdfPath]);
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
      await supabaseAdmin.storage.from("request-documents").remove([originalPdfPath]);
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
      await supabaseAdmin.storage.from("request-documents").remove([originalPdfPath]);
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

