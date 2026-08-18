import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isDepartmentViewer } from "@/lib/workflow/workflow-service";

// GET /api/attachments/[id]/download - Dosya indir (server-side stream)
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

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    // ORG_ADMIN employee bağı olmadan da erişebilmeli (PDF rotalarıyla tutarlı)
    const isOrgAdmin = appUser?.role === "ORG_ADMIN";
    if (!appUser?.employee_id && !isOrgAdmin) {
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

    // 3. Yetki kontrolü: talep sahibi, onaylayıcı, ORG_ADMIN veya departman
    // görüntüleyicisi mi?
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
    let authorized = isRequester || isOrgAdmin;

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
    }

    if (!authorized) {
      return NextResponse.json({ error: "Bu dosyayı indirme yetkiniz yok" }, { status: 403 });
    }

    // 4. Dosyayı storage'dan indir ve direkt stream et
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("workflow-attachments")
      .download(attachment.file_path);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json({ error: "Dosya indirilemedi" }, { status: 500 });
    }

    const fileBuffer = await fileData.arrayBuffer();
    const fileName = encodeURIComponent(attachment.file_name);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": fileBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

