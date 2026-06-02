// SharePoint sync retry worker.
// sharepoint_sync_queue tablosundaki pending/failed kayıtları işler:
//   1. attempt_count < MAX olanları çek
//   2. Exponential backoff: attempt_count * 5 dk minimum aralık
//   3. PDF'i Supabase Storage'dan indir, SharePoint'e yükle
//
// Cron API route ('/api/cron/sharepoint-sync-retry') tarafından tetiklenir;
// pg_cron + pg_net ile her 5 dakikada bir çağrılması beklenir.

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

interface QueueEntry {
  id: string;
  request_id: string;
  supabase_pdf_path: string;
  attempt_count: number;
  last_attempt_at: string | null;
}

interface EntryResult {
  queueId: string;
  requestId: string;
  outcome: "success" | "failed" | "skipped" | "error";
  reason?: string;
  webUrl?: string;
}

export interface RetryWorkerResult {
  fetched: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  entries: EntryResult[];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Bekleyen/başarısız queue kayıtlarını işler.
 * Her tetiklenmede en fazla `maxEntries` kayıt alır (default 20).
 *
 * Backoff stratejisi: kayıt için son denemeden bu yana
 * `attempt_count * 5 dakika` kadar süre geçmiş olmalı.
 * Admin manuel retry için `skipBackoff: true` geçilebilir.
 */
export async function processSharePointRetryQueue(
  options: { maxEntries?: number; skipBackoff?: boolean } = {}
): Promise<RetryWorkerResult> {
  const maxEntries = options.maxEntries ?? 20;
  const skipBackoff = options.skipBackoff ?? false;

  const supabaseAdmin = createServiceRoleClient();
  const maxAttempts = parseInt(
    process.env.SHAREPOINT_MAX_RETRY_ATTEMPTS ?? "5",
    10
  );

  const { data: rawEntries, error } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .select("id, request_id, supabase_pdf_path, attempt_count, last_attempt_at")
    // 'processing' de dahil: Vercel function timeout sonrası kayıt processing'de
    // takılıp kalır (last_error olmadan). Backoff (last_attempt_at kontrolü) bu
    // yetim kayıtları zaman geçince yakalar.
    .in("sync_status", ["pending", "failed", "processing"])
    .lt("attempt_count", maxAttempts)
    .order("created_at", { ascending: true })
    .limit(maxEntries);

  if (error) {
    throw new Error(`[sharepoint-retry] queue okuma hatası: ${error.message}`);
  }

  const entries = (rawEntries ?? []) as QueueEntry[];

  const result: RetryWorkerResult = {
    fetched: entries.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    entries: [],
  };

  for (const entry of entries) {
    if (!skipBackoff && shouldBackoff(entry)) {
      result.skipped++;
      result.entries.push({
        queueId: entry.id,
        requestId: entry.request_id,
        outcome: "skipped",
        reason: "backoff",
      });
      continue;
    }

    const entryResult = await processEntry(entry);
    result.processed++;
    result.entries.push(entryResult);

    if (entryResult.outcome === "success") result.succeeded++;
    else if (entryResult.outcome === "failed" || entryResult.outcome === "error")
      result.failed++;
  }

  return result;
}

/**
 * Belirli bir requestId için en güncel queue kaydını işler.
 * Admin manuel retry'da kullanılır — attempt_count ve backoff bypass'lanır.
 *
 * Kayıt success durumundaysa bile yeniden upload yapar (aynı dosya adı,
 * SharePoint overwrite). Bu admin'in bilinçli kararı sayılır.
 */
export async function retryQueueEntryForRequest(
  requestId: string
): Promise<EntryResult> {
  const supabaseAdmin = createServiceRoleClient();

  const { data, error } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .select("id, request_id, supabase_pdf_path, attempt_count, last_attempt_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      queueId: "",
      requestId,
      outcome: "error",
      reason: `Queue okuma hatası: ${error.message}`,
    };
  }
  if (!data) {
    return {
      queueId: "",
      requestId,
      outcome: "error",
      reason: "Bu talep için queue kaydı bulunamadı",
    };
  }

  return processEntry(data as QueueEntry);
}

// ============================================================================
// Internals
// ============================================================================

function shouldBackoff(entry: QueueEntry): boolean {
  if (!entry.last_attempt_at) return false;
  const minIntervalMs = Math.max(entry.attempt_count, 1) * 5 * 60 * 1000;
  const elapsedMs = Date.now() - new Date(entry.last_attempt_at).getTime();
  return elapsedMs < minIntervalMs;
}

async function processEntry(entry: QueueEntry): Promise<EntryResult> {
  const supabaseAdmin = createServiceRoleClient();

  try {
    const ctx = await fetchRequestUploadContext(entry.request_id);
    if (!ctx) {
      return {
        queueId: entry.id,
        requestId: entry.request_id,
        outcome: "error",
        reason: "request metadata bulunamadı",
      };
    }

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("request-documents")
      .download(entry.supabase_pdf_path);

    if (dlErr || !blob) {
      return {
        queueId: entry.id,
        requestId: entry.request_id,
        outcome: "error",
        reason: `Supabase PDF indirilemedi: ${dlErr?.message ?? "boş yanıt"}`,
      };
    }

    const pdfBuffer = Buffer.from(await blob.arrayBuffer());

    const fileName = deriveFileName(ctx);
    const folderPath = deriveFolderPath(ctx);

    const uploadResult = await uploadPdfToSharePoint({
      queueId: entry.id,
      requestId: entry.request_id,
      pdfBuffer,
      fileName,
      folderPath,
    });

    return {
      queueId: entry.id,
      requestId: entry.request_id,
      outcome: uploadResult.success ? "success" : "failed",
      reason: uploadResult.error,
      webUrl: uploadResult.webUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      queueId: entry.id,
      requestId: entry.request_id,
      outcome: "error",
      reason: message,
    };
  }
}
