import { createClient } from "@/lib/supabase/client";
import type { RequestAttachment } from "@/lib/workflow/types";

const ATTACHMENTS_BUCKET = "workflow-attachments";

export interface FailedUpload {
  name: string;
  error: string;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

function describeStorageError(error: { message?: string; statusCode?: string }): string {
  const message = (error.message || "").toLowerCase();
  if (error.statusCode === "413" || message.includes("maximum allowed size")) {
    return "Dosya boyutu depolama sınırını aşıyor";
  }
  if (error.statusCode === "415" || message.includes("mime type")) {
    return "Dosya türü desteklenmiyor";
  }
  return "Dosya depolama alanına yüklenemedi";
}

// Dosyayı doğrudan Supabase Storage'a yükler (imzalı URL ile), sonra kaydı
// API üzerinden oluşturur. Dosya gövdesi Next rotasından geçmez.
// Hata durumunda kullanıcıya gösterilebilir mesajla Error fırlatır.
export async function uploadAttachment(params: {
  file: File;
  requestId: string;
  configId: string;
}): Promise<RequestAttachment> {
  const { file, requestId, configId } = params;

  const urlRes = await fetch("/api/attachments/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      step_attachment_config_id: configId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    }),
  });

  if (!urlRes.ok) {
    throw new Error(await readApiError(urlRes, "Dosya yüklenemedi"));
  }

  const { path, token }: { path: string; token: string } = await urlRes.json();

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    throw new Error(describeStorageError(uploadError as { message?: string; statusCode?: string }));
  }

  const confirmRes = await fetch("/api/attachments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      step_attachment_config_id: configId,
      file_path: path,
      file_name: file.name,
    }),
  });

  if (!confirmRes.ok) {
    throw new Error(await readApiError(confirmRes, "Dosya kaydedilemedi"));
  }

  return confirmRes.json();
}

// Yeni talep formları: talep oluşturulduktan sonra bekleyen dosyaları sırayla
// yükler. Yüklenemeyenleri adı ve sebebiyle döndürür (boş dizi = hepsi yüklendi).
export async function uploadPendingFiles(
  files: File[],
  requestId: string,
  configId: string | null
): Promise<FailedUpload[]> {
  if (!configId) {
    return files.map((file) => ({ name: file.name, error: "Ek dosya ayarı yüklenemedi" }));
  }

  const failed: FailedUpload[] = [];
  for (const file of files) {
    try {
      await uploadAttachment({ file, requestId, configId });
    } catch (error) {
      failed.push({
        name: file.name,
        error: error instanceof Error ? error.message : "Dosya yüklenemedi",
      });
    }
  }
  return failed;
}
