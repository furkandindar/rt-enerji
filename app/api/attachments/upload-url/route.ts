import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  ATTACHMENTS_BUCKET,
  buildAttachmentStoragePath,
  validateAttachmentUpload,
} from "@/lib/attachments/validate-upload";

// POST /api/attachments/upload-url - Doğrudan Storage'a yükleme için imzalı URL üret
// Akış: upload-url (validasyon + imzalı URL) → tarayıcı dosyayı Storage'a yükler
// → /api/attachments/confirm (gerçek boyut/tür ile tekrar validasyon + DB kaydı).
// Dosya gövdesi Next rotasından geçmediği için Vercel istek sınırına takılmaz.
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
    const fileName: string | undefined = body?.file_name;
    const fileSize: unknown = body?.file_size;
    const mimeType: string = typeof body?.mime_type === "string" ? body.mime_type : "";

    if (!requestId || !configId || !fileName || typeof fileSize !== "number") {
      return NextResponse.json(
        { error: "request_id, step_attachment_config_id, file_name ve file_size zorunludur" },
        { status: 400 }
      );
    }

    const validation = await validateAttachmentUpload(supabase, {
      employeeId: appUser.employee_id,
      requestId,
      configId,
      mimeType,
      fileSize,
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const storagePath = buildAttachmentStoragePath(requestId, fileName);

    const { data: signed, error: signError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signError || !signed) {
      console.error("Signed upload URL error:", signError);
      return NextResponse.json({ error: "Yükleme bağlantısı oluşturulamadı" }, { status: 500 });
    }

    return NextResponse.json({ path: signed.path, token: signed.token });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
