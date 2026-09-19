import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ATTACHMENTS_BUCKET, validateAttachmentUpload } from "@/lib/attachments/validate-upload";

// POST /api/attachments/confirm - Doğrudan Storage'a yüklenen dosyayı kaydet
// İstemcinin beyan ettiği boyut/türe güvenilmez: Storage'daki nesnenin gerçek
// metadata'sı okunur ve kurallar onunla tekrar uygulanır. Kurala uymayan nesne
// Storage'dan silinir.
export async function POST(request: Request) {
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

    const body = await request.json().catch(() => null);
    const requestId: string | undefined = body?.request_id;
    const configId: string | undefined = body?.step_attachment_config_id;
    const filePath: string | undefined = body?.file_path;
    const fileName: string | undefined = body?.file_name;

    if (!requestId || !configId || !filePath || !fileName) {
      return NextResponse.json(
        { error: "request_id, step_attachment_config_id, file_path ve file_name zorunludur" },
        { status: 400 }
      );
    }

    // Yol yalnız bu talebin klasöründe, tek seviye bir nesne olabilir
    const prefix = `${requestId}/`;
    const objectName = filePath.startsWith(prefix) ? filePath.slice(prefix.length) : "";
    if (!objectName || objectName.includes("/") || objectName.includes("..")) {
      return NextResponse.json({ error: "Geçersiz dosya yolu" }, { status: 400 });
    }

    // Aynı nesne ikinci kez kaydedilemez
    const { data: alreadyLinked, error: linkedError } = await supabase
      .from("request_attachments")
      .select("id")
      .eq("request_id", requestId)
      .eq("file_path", filePath);

    if (linkedError) {
      return NextResponse.json({ error: "Dosya kaydı kontrol edilemedi" }, { status: 500 });
    }
    if (alreadyLinked && alreadyLinked.length > 0) {
      return NextResponse.json({ error: "Bu dosya zaten kaydedilmiş" }, { status: 409 });
    }

    const { data: info, error: infoError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .info(filePath);

    if (infoError || !info || typeof info.size !== "number") {
      return NextResponse.json({ error: "Yüklenen dosya bulunamadı" }, { status: 404 });
    }

    const mimeType = info.contentType ?? "";

    const validation = await validateAttachmentUpload(supabase, {
      employeeId: appUser.employee_id,
      requestId,
      configId,
      mimeType,
      fileSize: info.size,
    });

    if (!validation.ok) {
      if (validation.status === 400) {
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      }
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { data: attachment, error: insertError } = await supabase
      .from("request_attachments")
      .insert({
        request_id: requestId,
        step_attachment_config_id: configId,
        file_name: fileName,
        file_path: filePath,
        file_size: info.size,
        mime_type: mimeType,
        uploaded_by: appUser.employee_id,
      })
      .select()
      .single();

    if (insertError) {
      // Veritabanı hatası - storage'dan da sil
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      console.error("DB insert error:", insertError);
      return NextResponse.json({ error: "Dosya kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
