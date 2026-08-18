import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isDepartmentViewer } from "@/lib/workflow/workflow-service";

// GET /api/attachments?request_id=xxx - Talebe ait ek dosyaları listele
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const requestId = request.nextUrl.searchParams.get("request_id");

    if (!requestId) {
      return NextResponse.json({ error: "request_id zorunludur" }, { status: 400 });
    }

    // Kullanıcı kontrolü
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

    // Talebin sahibi, onaylayıcısı, ORG_ADMIN veya departman görüntüleyicisi
    // olduğunu doğrula
    const { data: req } = await supabase
      .from("requests")
      .select("requester_employee_id, workflow_definition_id")
      .eq("id", requestId)
      .single();

    if (!req) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    const isRequester =
      !!appUser.employee_id && req.requester_employee_id === appUser.employee_id;
    let authorized = isRequester || isOrgAdmin;

    if (!authorized && appUser.employee_id) {
      const { data: approval } = await supabase
        .from("request_approvals")
        .select("id")
        .eq("request_id", requestId)
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
      return NextResponse.json({ error: "Bu talep için yetkiniz yok" }, { status: 403 });
    }

    // Ek dosyaları çek
    const { data: files, error } = await supabase
      .from("request_attachments")
      .select("id, file_name, file_size, mime_type, config:workflow_step_attachments(label)")
      .eq("request_id", requestId)
      .order("uploaded_at", { ascending: true });

    if (error) {
      console.error("Error fetching attachments:", error);
      return NextResponse.json({ error: "Dosyalar alınamadı" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachments = (files || []).map((f: any) => ({
      id: f.id,
      file_name: f.file_name,
      file_size: f.file_size,
      mime_type: f.mime_type,
      config_label: f.config?.label || f.file_name,
    }));

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

