import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isDepartmentViewer, isUnitManagerViewer } from "@/lib/workflow/workflow-service";
import { getRequestContentAccess, RESTRICTED_CONTENT_MESSAGE } from "@/lib/workflow/content-access";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// GET /api/attachments/[id]/preview - PDF dosyasını inline görüntüle
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // 1. Kullanıcı kontrolü
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUser = await getUserAccess(supabase);
    if (!appUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // requests.view_all (Admin) employee bağı olmadan da erişebilmeli (PDF rotalarıyla tutarlı)
    const canViewAll = can(appUser, "requests.view_all");
    if (!appUser.employee_id && !canViewAll) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // 2. Attachment kaydını getir (service role - RLS bypass)
    const supabaseAdmin = createServiceRoleClient();
    const { data: attachment, error: fetchError } = await supabaseAdmin
      .from("request_attachments")
      .select("file_path, file_name, mime_type, request_id")
      .eq("id", id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // 3. Sadece PDF dosyaları için izin ver
    if (attachment.mime_type !== "application/pdf") {
      return NextResponse.json({ error: "Sadece PDF dosyaları önizlenebilir" }, { status: 400 });
    }

    // 4. Yetki kontrolü: talep sahibi, onaylayıcı, Admin (requests.view_all), departman
    // görüntüleyicisi veya Müdür mü?
    const { data: req } = await supabaseAdmin
      .from("requests")
      .select("requester_employee_id, workflow_definition_id")
      .eq("id", attachment.request_id)
      .single();

    if (!req) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    const isRequester =
      !!appUser.employee_id && req.requester_employee_id === appUser.employee_id;
    let authorized = isRequester || canViewAll;

    if (!authorized && appUser.employee_id) {
      const { data: approval } = await supabaseAdmin
        .from("request_approvals")
        .select("id")
        .eq("request_id", attachment.request_id)
        .eq("approver_employee_id", appUser.employee_id)
        .limit(1);

      authorized = !!approval && approval.length > 0;

      if (!authorized) {
        authorized = await isDepartmentViewer(
          supabase,
          appUser.employee_id,
          req.workflow_definition_id
        );
      }

      // Müdür: birimindeki çalışanın talebi (salt okunur)
      if (!authorized) {
        authorized = await isUnitManagerViewer(supabase, appUser.is_unit_manager, attachment.request_id);
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Bu dosyayı görüntüleme yetkiniz yok" }, { status: 403 });
    }

    // İçerik kısıtlı süreç (İşe Giriş / İşten Çıkış Onay): ekler içeriktir —
    // yalnız talep sahibi, İK ve Genel Müdür (lib/workflow/content-access.ts)
    const contentAccess = await getRequestContentAccess(supabase, attachment.request_id);
    if (!contentAccess.canView) {
      return NextResponse.json({ error: RESTRICTED_CONTENT_MESSAGE }, { status: 403 });
    }

    // 5. Dosyayı storage'dan indir ve inline olarak sun
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("workflow-attachments")
      .download(attachment.file_path);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json({ error: "Dosya yüklenemedi" }, { status: 500 });
    }

    const fileBuffer = await fileData.arrayBuffer();

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Content-Length": fileBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
