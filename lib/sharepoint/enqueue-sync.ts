// SharePoint sync queue producer.
// PDF üretildikten sonra çağrılır — queue kaydı oluşturur ve fire-and-forget
// olarak upload'u tetikler. Caller (PDF akışı) bloklanmaz, await edilmez.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  deriveArchiveTarget,
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
 * - Terminal kapısı: yalnız kesin sonuca ulaşmış talepler (APPROVED/COMPLETED/
 *   REJECTED/CANCELLED) arşivlenir; ara statüler (AWAITING_COMPLETION vb.)
 *   Storage'a yazılsa bile SharePoint'e GİTMEZ.
 * - Metadata'yı DB'den okur; hedef yol (klasör + dosya adı) bu anda çözülüp
 *   kuyruğa DONDURULUR — retry'lar hep aynı yere yazar.
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

  const target = deriveArchiveTarget(ctx);
  if (!target) {
    console.log(
      `[sharepoint-enqueue] skip — terminal olmayan statü=${ctx.status} requestId=${requestId}`
    );
    return;
  }
  const { folderPath, fileName, fullPath: targetSharepointPath } = target;

  // Idempotency guard — aynı (request, status, pdf path) için success ya da
  // henüz biten/işleyen bir kayıt varsa yeni enqueue yapma. Yalnızca 'failed'
  // veya 'skipped' durumlardan sonra yeni attempt anlamlı olur.
  const { data: existing } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .select("id, sync_status")
    .eq("request_id", requestId)
    .eq("request_status", ctx.status)
    .eq("supabase_pdf_path", supabasePdfPath)
    .in("sync_status", ["success", "pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(
      `[sharepoint-enqueue] skip — ${existing.sync_status} entry mevcut requestId=${requestId} status=${ctx.status}`
    );
    return;
  }

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

/**
 * Storage'da hazır duran nihai PDF'i (ıslak imzalı tarama, kaşeli belgenin
 * orijinali vb.) indirip arşiv kuyruğuna verir. PDF'i yeniden ÜRETMEYEN
 * akışların ortak giriş noktası — buildAndUploadRequestPDF'ten geçmeyen
 * her arşivleme buradan yapılmalı. Hata yutulur, log'lanır.
 */
export async function enqueueSharePointSyncFromStorage(params: {
  requestId: string;
  supabasePdfPath: string;
}): Promise<void> {
  if (process.env.SHAREPOINT_SYNC_ENABLED !== "true") {
    return;
  }

  const { requestId, supabasePdfPath } = params;

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { data: blob, error } = await supabaseAdmin.storage
      .from("request-documents")
      .download(supabasePdfPath);

    if (error || !blob) {
      console.error(
        `[sharepoint-enqueue] Storage PDF indirilemedi requestId=${requestId} path=${supabasePdfPath}:`,
        error?.message ?? "boş yanıt"
      );
      return;
    }

    const pdfBuffer = Buffer.from(await blob.arrayBuffer());
    await enqueueSharePointSync({ requestId, pdfBuffer, supabasePdfPath });
  } catch (err) {
    console.error(
      `[sharepoint-enqueue] storage-enqueue hatası requestId=${requestId}:`,
      err
    );
  }
}
