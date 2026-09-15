// Ağustos 2026 düzeniyle ({ROOT}/YYYY/AA-Ay/Belgeler/Tür/Sonuç) arşivlenmiş
// belgeleri organizasyon bazlı yeni düzene taşır.
//
// Yöntem: PDF yeniden ÜRETİLMEZ (imzalı taramalar korunur) — requests.pdf_path
// Storage'dan indirilir, yeni hedef yol türetilir, yeni kuyruk satırıyla
// yüklenir. uploadPdfToSharePoint başarılı yüklemeden sonra eski
// sharepoint_item_id'yi siler ("önce yeni yükle, sonra eskiyi temizle").
//
// Aday seçimi: sharepoint_path kökün hemen altında yıl klasörüyle başlıyorsa
// ({ROOT}/20xx/…). Yeni düzende ikinci segment departman adıdır, asla yıl
// olmaz — taşınan talep otomatik olarak aday olmaktan çıkar (idempotent).
// Serverless zaman bütçesi için partiler halinde çalışır; `remaining` 0
// olana kadar tekrar çağrılır.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isArchivableStatus } from "@/lib/pdf/file-naming";
import {
  deriveArchiveTarget,
  fetchRequestUploadContext,
} from "./request-metadata";
import { uploadPdfToSharePoint } from "./upload-pdf";

// ============================================================================
// Types
// ============================================================================

export interface MigrateArchiveParams {
  rootFolder: string;
  limit?: number;            // bu çağrıda işlenecek en fazla talep
  dryRun?: boolean;          // true: yalnız aday listesi (eski → yeni yol)
  concurrency?: number;
  timeBudgetMs?: number;
}

export interface MigrationPreview {
  requestNo: string;
  from: string;
  to: string;
}

export interface MigrateArchiveResult {
  rootFolder: string;
  dryRun: boolean;
  candidatesTotal: number;   // filtreye uyan toplam (bu parti dahil)
  fetched: number;           // bu partide ele alınan
  migrated: number;
  skipped: { requestNo: string; reason: string }[];
  failed: { requestNo: string; error: string }[];
  remaining: number;         // bu çağrı sonrası hâlâ aday olanlar (tahmini)
  completed: boolean;        // false → zaman bütçesi bitti, tekrar çağır
  durationMs: number;
  preview: MigrationPreview[];  // dryRun'da bu partinin eski → yeni yolları
}

interface CandidateRow {
  id: string;
  request_no: string;
  status: string;
  pdf_path: string;
  sharepoint_path: string;
}

const DEFAULT_LIMIT = 25;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TIME_BUDGET_MS = 45_000;

// ============================================================================
// Public API
// ============================================================================

export async function migrateArchiveLayout(
  params: MigrateArchiveParams
): Promise<MigrateArchiveResult> {
  const {
    rootFolder,
    limit = DEFAULT_LIMIT,
    dryRun = false,
    concurrency = DEFAULT_CONCURRENCY,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  } = params;

  const startedAt = Date.now();
  const supabaseAdmin = createServiceRoleClient();

  // Ağustos düzeni imzası: kökün hemen altında 20xx yıl klasörü.
  const legacyPattern = `${rootFolder}/20%`;

  const { count } = await supabaseAdmin
    .from("requests")
    .select("id", { count: "exact", head: true })
    .like("sharepoint_path", legacyPattern)
    .not("pdf_path", "is", null);
  const candidatesTotal = count ?? 0;

  const { data: rows, error } = await supabaseAdmin
    .from("requests")
    .select("id, request_no, status, pdf_path, sharepoint_path")
    .like("sharepoint_path", legacyPattern)
    .not("pdf_path", "is", null)
    .order("completed_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`[sharepoint-migrate] aday okuma hatası: ${error.message}`);
  }

  const candidates = (rows ?? []) as CandidateRow[];

  const result: MigrateArchiveResult = {
    rootFolder,
    dryRun,
    candidatesTotal,
    fetched: candidates.length,
    migrated: 0,
    skipped: [],
    failed: [],
    remaining: candidatesTotal,
    completed: true,
    durationMs: 0,
    preview: [],
  };

  if (candidates.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // Bir önceki çağrı zaman aşımında kalmış olabilir: kuyrukta hâlâ
  // pending/processing satırı olan talebi cron'a bırak, ikinci satır açma.
  const { data: inflight } = await supabaseAdmin
    .from("sharepoint_sync_queue")
    .select("request_id")
    .in("request_id", candidates.map((c) => c.id))
    .in("sync_status", ["pending", "processing"]);
  const inflightIds = new Set(
    ((inflight ?? []) as { request_id: string }[]).map((r) => r.request_id)
  );

  await runWithConcurrency(candidates, concurrency, async (row) => {
    if (inflightIds.has(row.id)) {
      result.skipped.push({ requestNo: row.request_no, reason: "kuyrukta bekleyen satır var" });
      return;
    }

    if (!isArchivableStatus(row.status)) {
      result.skipped.push({ requestNo: row.request_no, reason: `terminal olmayan statü ${row.status}` });
      return;
    }

    const ctx = await fetchRequestUploadContext(row.id);
    const target = ctx ? deriveArchiveTarget(ctx) : null;
    if (!target) {
      result.skipped.push({ requestNo: row.request_no, reason: "hedef yol türetilemedi" });
      return;
    }

    if (target.fullPath === row.sharepoint_path) {
      result.skipped.push({ requestNo: row.request_no, reason: "zaten yeni düzende" });
      return;
    }

    if (dryRun) {
      result.preview.push({ requestNo: row.request_no, from: row.sharepoint_path, to: target.fullPath });
      return;
    }

    if (Date.now() - startedAt > timeBudgetMs) {
      result.completed = false;
      return;
    }

    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("request-documents")
        .download(row.pdf_path);
      if (dlErr || !blob) {
        throw new Error(`Storage PDF indirilemedi (${row.pdf_path}): ${dlErr?.message ?? "boş yanıt"}`);
      }
      const pdfBuffer = Buffer.from(await blob.arrayBuffer());

      const { data: queueRow, error: queueErr } = await supabaseAdmin
        .from("sharepoint_sync_queue")
        .insert({
          request_id: row.id,
          request_status: row.status,
          supabase_pdf_path: row.pdf_path,
          target_sharepoint_path: target.fullPath,
          sync_status: "pending",
        })
        .select("id")
        .single();
      if (queueErr || !queueRow) {
        throw new Error(`kuyruk satırı açılamadı: ${queueErr?.message ?? "boş yanıt"}`);
      }

      // Başarıda requests.sharepoint_* güncellenir ve eski item silinir;
      // başarısızlıkta satır 'failed' kalır, prod cron'u dondurulmuş yeni
      // yola yeniden dener — talep bir sonraki partide de aday olarak görünür
      // ama inflight kontrolü ikinci satır açılmasını engeller.
      const upload = await uploadPdfToSharePoint({
        queueId: queueRow.id,
        requestId: row.id,
        pdfBuffer,
        fileName: target.fileName,
        folderPath: target.folderPath,
      });

      if (upload.success) {
        result.migrated++;
      } else {
        result.failed.push({ requestNo: row.request_no, error: upload.error ?? "bilinmeyen hata" });
      }
    } catch (err) {
      result.failed.push({
        requestNo: row.request_no,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  result.remaining = Math.max(0, candidatesTotal - result.migrated);
  result.durationMs = Date.now() - startedAt;
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
