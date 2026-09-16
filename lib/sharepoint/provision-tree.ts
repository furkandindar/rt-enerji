// Arşiv ağacının statik kısmını (kök → departman → birim → form → sonuç)
// SharePoint'te toplu olarak oluşturur. BT klasör izinlerini belge gelmeden
// verebilsin diye ağaç önceden açılır; yıl/ay klasörleri ilk belgeyle
// kendiliğinden açılır (upload hattı ensureFolderPath kullanmaya devam eder).
//
// Partili çalışır: plan (derinlik sırasında, deterministik) `offset`'ten
// başlayıp en fazla `limit` klasör işler ve `nextOffset` döner; çağıran
// `completed` olana kadar tekrar çağırır. 530 klasörü tek istekte açmak
// Vercel'in 60s sınırına takılıp 504 veriyordu.
//
// Idempotent: var olan klasör "exists" sayılır, aynı parti tekrar edilebilir.

import { createChildFolder } from "@/lib/msgraph/sharepoint";
import { listStaticArchiveFolders } from "./folder-mapper";

// ============================================================================
// Types
// ============================================================================

export interface ProvisionArchiveTreeParams {
  driveId: string;
  rootFolder: string;
  scope?: string | null;     // kök altındaki ilk segment (örn. "İnsan Kaynakları") — alt ağaç sınırı
  dryRun?: boolean;          // true: Graph'a dokunmaz, yalnız planı döner
  offset?: number;           // plandaki başlangıç indeksi (partili çağrı)
  limit?: number;            // bu çağrıda işlenecek en fazla klasör
  concurrency?: number;      // aynı seviyede paralel istek sayısı
  timeBudgetMs?: number;     // bu süre aşılınca yeni klasör açılmaz
}

export interface ProvisionArchiveTreeResult {
  rootFolder: string;
  scope: string | null;
  dryRun: boolean;
  leafCount: number;         // kapsam içindeki sonuç klasörü sayısı
  totalFolders: number;      // ara klasörler dahil plandaki toplam klasör
  offset: number;            // bu partinin başlangıcı
  batchSize: number;         // bu partide ele alınan klasör sayısı
  created: number;
  existing: number;
  failed: { path: string; error: string }[];
  nextOffset: number;        // bir sonraki çağrının offset'i (completed ise = totalFolders)
  completed: boolean;        // true → plan bitti; false → nextOffset ile tekrar çağır
  budgetExceeded: boolean;   // true → parti yarım kaldı, aynı offset ile tekrar
  retryBatch: boolean;       // true → partide hata/yarım var, nextOffset = offset (ilerlemedi)
  durationMs: number;
  planned: string[];         // derinlik sırasında tüm klasör yolları
}

const DEFAULT_LIMIT = 50;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIME_BUDGET_MS = 25_000;  // prod'da 80 klasör bütçeyi aşıyordu; 50 rahat sığar

// ============================================================================
// Public API
// ============================================================================

/**
 * Kök altında seçilebilecek kapsamlar (departman seviyesi klasör adları).
 * Route geçersiz `scope` için bunu 400 yanıtında listeler.
 */
export function listArchiveScopes(rootFolder: string): string[] {
  const rootDepth = splitPath(rootFolder).length;
  const scopes = new Set<string>();
  for (const leaf of listStaticArchiveFolders(rootFolder)) {
    const segment = splitPath(leaf)[rootDepth];
    if (segment) scopes.add(segment);
  }
  return Array.from(scopes).sort((a, b) => a.localeCompare(b, "tr"));
}

/**
 * Planın [offset, offset+limit) dilimini derinlik sırasında, seviye seviye
 * açar. Plan derinliğe göre sıralı olduğundan bir klasörün üstü ya daha önceki
 * bir partide ya da aynı partide daha önceki seviyede açılmış olur.
 */
export async function provisionArchiveTree(
  params: ProvisionArchiveTreeParams
): Promise<ProvisionArchiveTreeResult> {
  const {
    driveId,
    rootFolder,
    scope = null,
    dryRun = false,
    offset = 0,
    limit = DEFAULT_LIMIT,
    concurrency = DEFAULT_CONCURRENCY,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  } = params;

  const startedAt = Date.now();
  const rootDepth = splitPath(rootFolder).length;

  const leaves = listStaticArchiveFolders(rootFolder).filter((leaf) =>
    scope ? splitPath(leaf)[rootDepth] === scope : true
  );

  const planned = expandToAllPrefixes(leaves);
  const start = Math.min(Math.max(0, offset), planned.length);
  const batch = planned.slice(start, start + limit);

  const result: ProvisionArchiveTreeResult = {
    rootFolder,
    scope,
    dryRun,
    leafCount: leaves.length,
    totalFolders: planned.length,
    offset: start,
    batchSize: batch.length,
    created: 0,
    existing: 0,
    failed: [],
    nextOffset: start + batch.length,
    completed: start + batch.length >= planned.length,
    budgetExceeded: false,
    retryBatch: false,
    durationMs: 0,
    planned,
  };

  if (dryRun || batch.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const byDepth = groupByDepth(batch);
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    if (result.budgetExceeded) break;
    const paths = byDepth.get(depth) ?? [];

    await runWithConcurrency(paths, concurrency, async (path) => {
      if (result.budgetExceeded || Date.now() - startedAt > timeBudgetMs) {
        result.budgetExceeded = true;
        return;
      }

      const segments = splitPath(path);
      const name = segments[segments.length - 1];
      const parentPath = segments.slice(0, -1).join("/");

      try {
        const outcome = await createChildFolder(driveId, parentPath, name);
        if (outcome === "created") result.created++;
        else result.existing++;
      } catch (err) {
        result.failed.push({
          path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  // Parti yarım kaldıysa YA DA içinde hata varsa aynı offset'ten tekrar:
  // açılanlar "exists" der, geçer; hatalılar yeniden denenir. Offset ilerleseydi
  // geçici bir 429 yüzünden açılamayan klasör sessizce eksik kalırdı (prod'da
  // ilk çalıştırmada 2 klasör böyle atlandı). Kalıcı hata varsa çağıran
  // offset'i elle ilerletebilir.
  if (result.budgetExceeded || result.failed.length > 0) {
    result.retryBatch = true;
    result.nextOffset = start;
    result.completed = false;
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * Yaprak yollardan tüm ön-ek yollarını üretir ("a/b/c" → "a", "a/b", "a/b/c"),
 * tekilleştirir, derinliğe sonra ada göre sıralar — deterministik plan.
 */
function expandToAllPrefixes(leaves: string[]): string[] {
  const all = new Set<string>();
  for (const leaf of leaves) {
    const segments = splitPath(leaf);
    for (let i = 1; i <= segments.length; i++) {
      all.add(segments.slice(0, i).join("/"));
    }
  }
  return Array.from(all).sort((a, b) => {
    const da = splitPath(a).length;
    const db = splitPath(b).length;
    return da !== db ? da - db : a.localeCompare(b, "tr");
  });
}

function groupByDepth(paths: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const path of paths) {
    const depth = splitPath(path).length;
    const bucket = map.get(depth);
    if (bucket) bucket.push(path);
    else map.set(depth, [path]);
  }
  return map;
}

/**
 * Küçük yerel havuz — `limit` kadar worker aynı listeyi sırayla tüketir.
 * Tek işçinin hatası diğerlerini durdurmaz; hata yönetimi `fn` içinde.
 */
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
