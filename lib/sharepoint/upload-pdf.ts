// SharePoint PDF upload — business logic.
// Verilen PDF buffer'ını SharePoint'e yükler, requests + sharepoint_sync_queue
// tablolarını günceller. Hata durumunda exception YUTAR — caller akışı bloklanmaz.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  ensureFolderPath,
  resolveSharePointDrive,
  resolveSharePointSite,
  uploadFileToSharePoint,
} from "@/lib/msgraph/sharepoint";
import type { Database } from "@/lib/database.types";

type RequestStatus = Database["public"]["Enums"]["request_status"];

// ============================================================================
// Types
// ============================================================================

export interface UploadPdfToSharePointParams {
  queueId: string;          // sharepoint_sync_queue.id (status update'leri için)
  requestId: string;        // requests.id
  pdfBuffer: Buffer;
  fileName: string;         // buildPdfFileName() çıktısı
  folderPath: string;       // buildSharePointPath() çıktısı (root dahil)
}

export interface UploadResult {
  success: boolean;
  itemId?: string;
  webUrl?: string;
  fullPath?: string;
  error?: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * SharePoint'e yükler ve queue/requests tablolarını günceller.
 * Hiçbir koşulda throw etmez — caller'ın bloklanmaması gerekir.
 *
 * Akış:
 *  1. queue: sync_status='processing', attempt_count++
 *  2. Graph: site & drive resolve, klasör ensure, dosya upload
 *  3. requests: sharepoint_path / item_id / web_url / sync_status='success'
 *  4. queue: sync_status='success', completed_at
 *
 * Başarısızlıkta:
 *  - queue: sync_status='failed', last_error
 *  - requests: sharepoint_sync_status='failed', sharepoint_last_error
 */
export async function uploadPdfToSharePoint(
  params: UploadPdfToSharePointParams
): Promise<UploadResult> {
  const { queueId, requestId, pdfBuffer, fileName, folderPath } = params;
  const supabaseAdmin = createServiceRoleClient();

  await markQueueProcessing(queueId);

  try {
    const siteUrl = requireEnv("SHAREPOINT_SITE_URL");
    const libraryName = process.env.SHAREPOINT_LIBRARY_NAME ?? "Documents";

    const siteId = await resolveSharePointSite(siteUrl);
    const driveId = await resolveSharePointDrive(siteId, libraryName);

    await ensureFolderPath(driveId, folderPath);

    const item = await uploadFileToSharePoint({
      driveId,
      folderPath,
      fileName,
      buffer: pdfBuffer,
      contentType: "application/pdf",
    });

    const fullPath = `${folderPath}/${fileName}`;

    await supabaseAdmin
      .from("requests")
      .update({
        sharepoint_path: fullPath,
        sharepoint_item_id: item.id,
        sharepoint_web_url: item.webUrl,
        sharepoint_sync_status: "success",
        sharepoint_synced_at: new Date().toISOString(),
        sharepoint_last_error: null,
      })
      .eq("id", requestId);

    await supabaseAdmin
      .from("sharepoint_sync_queue")
      .update({
        sync_status: "success",
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", queueId);

    return {
      success: true,
      itemId: item.id,
      webUrl: item.webUrl,
      fullPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sharepoint-upload] requestId=${requestId} hata:`, message);

    await supabaseAdmin
      .from("requests")
      .update({
        sharepoint_sync_status: "failed",
        sharepoint_last_error: message,
      })
      .eq("id", requestId);

    await supabaseAdmin
      .from("sharepoint_sync_queue")
      .update({
        sync_status: "failed",
        last_error: message,
      })
      .eq("id", queueId);

    return { success: false, error: message };
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function markQueueProcessing(queueId: string): Promise<void> {
  const supabaseAdmin = createServiceRoleClient();
  // Atomik attempt_count++ için RPC yerine basit yol: önce oku, sonra yaz.
  // Tek worker varsayımında yeterli; ileride concurrent worker eklenirse
  // pg fonksiyonu ile değiştirilebilir.
  const { data } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .select("attempt_count")
    .eq("id", queueId)
    .single();

  await supabaseAdmin
    .from("sharepoint_sync_queue")
    .update({
      sync_status: "processing",
      attempt_count: (data?.attempt_count ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", queueId);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[sharepoint-upload] ${name} env değişkeni tanımlı değil.`);
  }
  return value;
}

// Type guard for RequestStatus — used externally if needed
export function isValidRequestStatus(value: string): value is RequestStatus {
  const valid: RequestStatus[] = [
    "DRAFT", "PENDING", "APPROVED", "AWAITING_COMPLETION",
    "COMPLETED", "REJECTED", "CANCELLED", "REVISION_REQUESTED",
  ];
  return valid.includes(value as RequestStatus);
}
