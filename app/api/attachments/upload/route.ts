import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  ATTACHMENTS_BUCKET,
  buildAttachmentStoragePath,
  validateAttachmentUpload,
} from "@/lib/attachments/validate-upload";

// POST /api/attachments/upload - Dosya yükle
// NOT: Dosya bu rotanın gövdesinden geçtiği için Vercel istek sınırına (~4.5MB)
// takılır. Büyük dosyalar için upload-url + confirm akışı kullanılır
// (lib/attachments/upload-attachment.ts).
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

    // 3-4. Config validasyonu (tür, boyut, adet) + yetki kontrolü
    const validation = await validateAttachmentUpload(supabase, {
      employeeId: appUser.employee_id,
      requestId,
      configId,
      mimeType: file.type,
      fileSize: file.size,
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // 5. Storage'a yükle
    const storagePath = buildAttachmentStoragePath(requestId, file.name);

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
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
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
      console.error("DB insert error:", insertError);
      return NextResponse.json({ error: "Dosya kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
