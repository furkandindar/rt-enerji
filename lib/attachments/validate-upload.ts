import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export const ATTACHMENTS_BUCKET = "workflow-attachments";

export type UploadValidation =
  | { ok: true }
  | { ok: false; status: number; error: string };

interface ValidateParams {
  employeeId: string;
  requestId: string;
  configId: string;
  mimeType: string;
  fileSize: number;
}

// Ek dosya yükleme kuralları (tür, boyut, adet, yetki). Limitler
// workflow_step_attachments config'inden gelir; kodda sabit limit yoktur.
// Hem klasik multipart rotası hem de doğrudan-Storage akışı (upload-url +
// confirm) aynı kuralları buradan uygular.
export async function validateAttachmentUpload(
  supabase: ServerClient,
  { employeeId, requestId, configId, mimeType, fileSize }: ValidateParams
): Promise<UploadValidation> {
  const { data: config, error: configError } = await supabase
    .from("workflow_step_attachments")
    .select("*")
    .eq("id", configId)
    .single();

  if (configError || !config) {
    return { ok: false, status: 404, error: "Attachment config bulunamadı" };
  }

  // Dosya tipi (null veya boş ise tüm tipler kabul edilir)
  if (config.allowed_mime_types && config.allowed_mime_types.length > 0 && !config.allowed_mime_types.includes(mimeType)) {
    return {
      ok: false,
      status: 400,
      error: `Geçersiz dosya tipi. İzin verilen: ${config.allowed_mime_types.join(", ")}`,
    };
  }

  // Dosya boyutu
  if (fileSize > config.max_file_size_bytes) {
    const maxMB = Math.round(config.max_file_size_bytes / 1048576);
    return { ok: false, status: 400, error: `Dosya boyutu çok büyük. Maksimum: ${maxMB}MB` };
  }

  // Maksimum dosya sayısı
  const { data: existingFiles, error: countError } = await supabase
    .from("request_attachments")
    .select("id")
    .eq("request_id", requestId)
    .eq("step_attachment_config_id", configId);

  if (countError) {
    return { ok: false, status: 500, error: "Dosya sayısı kontrol edilemedi" };
  }

  if (existingFiles && existingFiles.length >= config.max_files) {
    return {
      ok: false,
      status: 400,
      error: `Bu alan için maksimum ${config.max_files} dosya yüklenebilir`,
    };
  }

  // Yetki - talep sahibi veya bekleyen onaycı mı?
  const { data: requestData } = await supabase
    .from("requests")
    .select("requester_employee_id")
    .eq("id", requestId)
    .single();

  const isRequester = requestData?.requester_employee_id === employeeId;

  if (!isRequester) {
    const { data: approval } = await supabase
      .from("request_approvals")
      .select("id")
      .eq("request_id", requestId)
      .eq("approver_employee_id", employeeId)
      .eq("status", "PENDING");

    if (!approval || approval.length === 0) {
      return { ok: false, status: 403, error: "Bu talep için dosya yükleme yetkiniz yok" };
    }
  }

  return { ok: true };
}

export function buildAttachmentStoragePath(requestId: string, fileName: string): string {
  const uniqueId = crypto.randomUUID().split("-")[0];
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${requestId}/${uniqueId}_${sanitizedName}`;
}
