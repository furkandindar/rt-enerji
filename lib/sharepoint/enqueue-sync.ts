// SharePoint sync queue producer.
// PDF üretildikten sonra çağrılır — queue kaydı oluşturur ve fire-and-forget
// olarak upload'u tetikler. Caller (PDF akışı) bloklanmaz, await edilmez.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  deriveFileName,
  deriveFolderPath,
  fetchRequestUploadContext,
} from "./request-metadata";
import { uploadPdfToSharePoint } from "./upload-pdf";

// ============================================================================
// Types
// ============================================================================

export interface EnqueueSharePointSyncParams {
  requestId: string;
  pdfBuffer: Buffer;
  supabasePdfPath: string;  // Supabase Storage'daki path (queue audit için)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Talep PDF'i için SharePoint sync kaydı oluşturur ve hemen upload tetikler.
 *
 * - Killswitch: SHAREPOINT_SYNC_ENABLED=true değilse no-op.
 * - Metadata'yı DB'den okur (workflow code, request_no, requester adı, status).
 * - Queue insert + fire-and-forget upload. Hata yutulur, log'lanır.
 *
 * Fire-and-forget: caller `await` etse bile sadece queue insert beklenir;
 * upload arka planda devam eder ve caller'ın response'unu bloklamaz.
 */
export async function enqueueSharePointSync(
  params: EnqueueSharePointSyncParams
): Promise<void> {
  if (process.env.SHAREPOINT_SYNC_ENABLED !== "true") {
    return;
  }

  const { requestId, pdfBuffer, supabasePdfPath } = params;
  const supabaseAdmin = createServiceRoleClient();

  const ctx = await fetchRequestUploadContext(requestId);
  if (!ctx) {
    console.error(
      `[sharepoint-enqueue] requestId=${requestId} metadata okunamadı.`
    );
    return;
  }

  const fileName = deriveFileName(ctx);
  const folderPath = deriveFolderPath(ctx);
  const targetSharepointPath = `${folderPath}/${fileName}`;

  const { data: queueRow, error: queueErr } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .insert({
      request_id: requestId,
      request_status: ctx.status,
      supabase_pdf_path: supabasePdfPath,
      target_sharepoint_path: targetSharepointPath,
      sync_status: "pending",
    })
    .select("id")
    .single();

  if (queueErr || !queueRow) {
    console.error(
      `[sharepoint-enqueue] queue insert başarısız requestId=${requestId}:`,
      queueErr?.message
    );
    return;
  }

  // Fire-and-forget — promise'i await etmiyoruz, caller bloklanmasın.
  uploadPdfToSharePoint({
    queueId: queueRow.id,
    requestId,
    pdfBuffer,
    fileName,
    folderPath,
  }).catch((err) => {
    // upload-pdf zaten kendi hatasını yutar; bu catch defansif fallback.
    console.error(
      `[sharepoint-enqueue] unhandled upload error requestId=${requestId}:`,
      err
    );
  });
}
