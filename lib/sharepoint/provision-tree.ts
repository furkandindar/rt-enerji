// Arşiv ağacının statik kısmını (kök → departman → birim → form → sonuç)
// SharePoint'te toplu olarak oluşturur. BT klasör izinlerini belge gelmeden
// verebilsin diye ağaç önceden açılır; yıl/ay klasörleri ilk belgeyle
// kendiliğinden açılır (upload hattı ensureFolderPath kullanmaya devam eder).
//
// Idempotent: var olan klasör "exists" sayılır, tekrar çalıştırmak güvenlidir.
// Serverless zaman bütçesi aşılırsa kalan yollar atlanır (`completed=false`);
// aynı çağrı tekrar edilince kaldığı yerden devam eder.

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
  concurrency?: number;      // aynı seviyede paralel istek sayısı
  timeBudgetMs?: number;     // bu süre aşılınca yeni klasör açılmaz, kalan "skipped"
}

export interface ProvisionArchiveTreeResult {
  rootFolder: string;
  scope: string | null;
  dryRun: boolean;
  leafCount: number;         // kapsam içindeki sonuç klasörü sayısı
  totalFolders: number;      // ara klasörler dahil açılacak toplam klasör
  created: number;
  existing: number;
  skipped: number;           // zaman bütçesi bitince açılmayan
  failed: { path: string; error: string }[];
  completed: boolean;        // false → tekrar çalıştır (idempotent)
  durationMs: number;
  planned: string[];         // derinlik sırasında tüm klasör yolları
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_TIME_BUDGET_MS = 48_000;  // route maxDuration=60 altında pay bırakır

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
 * Statik ağacı derinlik sırasında, seviye seviye açar. Bir seviyedeki tüm
 * klasörler (created/exists/failed) bitmeden alt seviyeye geçilmez — üst
 * klasör garanti altında olsun.
 */
export async function provisionArchiveTree(
  params: ProvisionArchiveTreeParams
): Promise<ProvisionArchiveTreeResult> {
  const {
    driveId,
    rootFolder,
    scope = null,
    dryRun = false,
    concurrency = DEFAULT_CONCURRENCY,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  } = params;

  const startedAt = Date.now();
  const rootDepth = splitPath(rootFolder).length;

  const leaves = listStaticArchiveFolders(rootFolder).filter((leaf) =>
    scope ? splitPath(leaf)[rootDepth] === scope : true
  );

  const planned = expandToAllPrefixes(leaves);

  const result: ProvisionArchiveTreeResult = {
    rootFolder,
    scope,
    dryRun,
    leafCount: leaves.length,
    totalFolders: planned.length,
    created: 0,
    existing: 0,
    skipped: 0,
    failed: [],
    completed: true,
    durationMs: 0,
    planned,
  };

  if (dryRun || planned.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const byDepth = groupByDepth(planned);
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const paths = byDepth.get(depth) ?? [];

    await runWithConcurrency(paths, concurrency, async (path) => {
      if (Date.now() - startedAt > timeBudgetMs) {
        result.skipped++;
        result.completed = false;
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
 * tekilleştirir, derinliğe sonra ada göre sıralar.
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
