import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/attachments/upload - Dosya yükle
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Kullanıcı kontrolü
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

    // 2. FormData'dan dosya ve alanları al
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestId = formData.get("request_id") as string | null;
    const configId = formData.get("step_attachment_config_id") as string | null;

    if (!file || !requestId || !configId) {
      return NextResponse.json({ error: "file, request_id ve step_attachment_config_id zorunludur" }, { status: 400 });
    }

    // 3. Attachment config'i getir ve validasyon yap
    const { data: config, error: configError } = await supabase
      .from("workflow_step_attachments")
      .select("*")
      .eq("id", configId)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: "Attachment config bulunamadı" }, { status: 404 });
    }

    // 3a. Dosya tipi kontrolü
    if (!config.allowed_mime_types.includes(file.type)) {
      return NextResponse.json({
        error: `Geçersiz dosya tipi. İzin verilen: ${config.allowed_mime_types.join(", ")}`,
      }, { status: 400 });
    }

    // 3b. Dosya boyutu kontrolü
    if (file.size > config.max_file_size_bytes) {
      const maxMB = Math.round(config.max_file_size_bytes / 1048576);
      return NextResponse.json({
        error: `Dosya boyutu çok büyük. Maksimum: ${maxMB}MB`,
      }, { status: 400 });
    }

    // 3c. Maksimum dosya sayısı kontrolü
    const { data: existingFiles, error: countError } = await supabase
      .from("request_attachments")
      .select("id")
      .eq("request_id", requestId)
      .eq("step_attachment_config_id", configId);

    if (countError) {
      return NextResponse.json({ error: "Dosya sayısı kontrol edilemedi" }, { status: 500 });
    }

    if (existingFiles && existingFiles.length >= config.max_files) {
      return NextResponse.json({
        error: `Bu alan için maksimum ${config.max_files} dosya yüklenebilir`,
      }, { status: 400 });
    }

    // 4. Yetki kontrolü - talep sahibi veya bekleyen onaycı mı?
    const { data: requestData } = await supabase
      .from("requests")
      .select("requester_employee_id")
      .eq("id", requestId)
      .single();

    const isRequester = requestData?.requester_employee_id === appUser.employee_id;

    if (!isRequester) {
      const { data: approval } = await supabase
        .from("request_approvals")
        .select("id")
        .eq("request_id", requestId)
        .eq("approver_employee_id", appUser.employee_id)
        .eq("status", "PENDING");

      if (!approval || approval.length === 0) {
        return NextResponse.json({ error: "Bu talep için dosya yükleme yetkiniz yok" }, { status: 403 });
      }
    }

    // 5. Storage'a yükle
    const fileExt = file.name.split(".").pop() || "pdf";
    const uniqueId = crypto.randomUUID().split("-")[0];
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${requestId}/${uniqueId}_${sanitizedName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("workflow-attachments")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Dosya yüklenemedi" }, { status: 500 });
    }

    // 6. Veritabanına kaydet
    const { data: attachment, error: insertError } = await supabase
      .from("request_attachments")
      .insert({
        request_id: requestId,
        step_attachment_config_id: configId,
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: appUser.employee_id,
      })
      .select()
      .single();

    if (insertError) {
      // Veritabanı hatası - storage'dan da sil
      await supabase.storage.from("workflow-attachments").remove([storagePath]);
      console.error("DB insert error:", insertError);
      return NextResponse.json({ error: "Dosya kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

