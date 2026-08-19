// SharePoint endpoints via Microsoft Graph (Application permission, Sites.Selected).
// Server-only. Sadece atanan site'larda yazma yetkisi vardır.
// PDF arşivleme akışında kullanılır — lib/sharepoint/* business logic'i bu wrapper'a oturur.

import { getAppAccessToken, graphAppFetch } from "./app-client";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// ============================================================================
// Types
// ============================================================================

interface GraphSite {
  id: string;        // "{hostname},{site-collection-guid},{site-guid}"
  webUrl: string;
  displayName: string;
}

interface GraphDrive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

export interface SharePointDriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  file?: { mimeType: string };
  folder?: { childCount: number };
}

// ============================================================================
// Cache (process-wide; site URL/library adları değişmez)
// ============================================================================

const siteIdCache = new Map<string, string>();      // siteUrl -> siteId
const driveIdCache = new Map<string, string>();     // `${siteId}:${libraryName}` -> driveId

// ============================================================================
// Site / Drive resolution
// ============================================================================

/**
 * Site URL'sinden Graph site ID elde eder ("hostname,guid,guid" formatı).
 * Sonuç in-memory cache'lenir.
 */
export async function resolveSharePointSite(siteUrl: string): Promise<string> {
  const cached = siteIdCache.get(siteUrl);
  if (cached) return cached;

  const { hostname, sitePath } = parseSiteUrl(siteUrl);
  const path = `/sites/${hostname}:/sites/${sitePath}`;

  const response = await graphAppFetch(path);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[SharePoint] Site bulunamadı (${siteUrl}): ${response.status} ${text}`
    );
  }

  const data = (await response.json()) as GraphSite;
  siteIdCache.set(siteUrl, data.id);
  return data.id;
}

/**
 * Belirtilen site'taki document library'nin drive ID'sini döner.
 * Library adı tenant diline göre değişebilir (örn. "Documents" / "Belgeler"),
 * bu yüzden env'den (SHAREPOINT_LIBRARY_NAME) parametrize edilir.
 */
export async function resolveSharePointDrive(
  siteId: string,
  libraryName: string
): Promise<string> {
  const key = `${siteId}:${libraryName}`;
  const cached = driveIdCache.get(key);
  if (cached) return cached;

  const response = await graphAppFetch(`/sites/${siteId}/drives`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[SharePoint] Drive listesi alınamadı: ${response.status} ${text}`
    );
  }

  const data = (await response.json()) as { value: GraphDrive[] };
  const drive = data.value.find((d) => d.name === libraryName);
  if (!drive) {
    const available = data.value.map((d) => d.name).join(", ") || "(yok)";
    throw new Error(
      `[SharePoint] "${libraryName}" adlı library bulunamadı. Mevcut library'ler: ${available}`
    );
  }

  driveIdCache.set(key, drive.id);
  return drive.id;
}

// ============================================================================
// Folder operations
// ============================================================================

/**
 * Verilen klasör yolunu drive'da garanti eder. Yoksa segment-segment oluşturur.
 * Idempotent — varsa atlar, race condition'da 409'u tolere eder.
 *
 * Örnek folderPath: "Talepler/01_Insan_Kaynaklari/Yillik_Izin/2026/05-Mayis"
 */
export async function ensureFolderPath(
  driveId: string,
  folderPath: string
): Promise<void> {
  const segments = folderPath.split("/").filter(Boolean);
  if (segments.length === 0) return;

  let currentPath = "";
  for (const segment of segments) {
    const parentPath = currentPath;
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

    const checkResp = await graphAppFetch(
      `/drives/${driveId}/root:/${encodePath(currentPath)}`
    );
    if (checkResp.ok) continue;
    if (checkResp.status !== 404) {
      const text = await checkResp.text();
      throw new Error(
        `[SharePoint] Klasör kontrol hatası (${currentPath}): ${checkResp.status} ${text}`
      );
    }

    const createUrl = parentPath
      ? `/drives/${driveId}/root:/${encodePath(parentPath)}:/children`
      : `/drives/${driveId}/root/children`;

    const createResp = await graphAppFetch(createUrl, {
      method: "POST",
      body: {
        name: segment,
        folder: {},
        // Race condition: paralel istek aynı segmenti yaratırsa 409 dönecek,
        // aşağıda 409'u tolere ediyoruz; "fail" diyerek replace etmeyi engelliyoruz.
        "@microsoft.graph.conflictBehavior": "fail",
      },
    });

    if (!createResp.ok && createResp.status !== 409) {
      const text = await createResp.text();
      throw new Error(
        `[SharePoint] Klasör oluşturulamadı (${currentPath}): ${createResp.status} ${text}`
      );
    }
  }
}

// ============================================================================
// File upload
// ============================================================================

/**
 * Dosyayı SharePoint'e yükler (simple PUT, 250MB'a kadar).
 * Dönen DriveItem'da webUrl alanı kullanıcının tarayıcıda açabileceği link.
 *
 * Not: graphAppFetch JSON için optimize, binary için doğrudan fetch + token.
 */
export async function uploadFileToSharePoint(params: {
  driveId: string;
  folderPath: string;
  fileName: string;
  buffer: Buffer | Uint8Array;
  contentType?: string;
}): Promise<SharePointDriveItem> {
  const {
    driveId,
    folderPath,
    fileName,
    buffer,
    contentType = "application/pdf",
  } = params;

  const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
  const url = `${GRAPH_BASE_URL}/drives/${driveId}/root:/${encodePath(fullPath)}:/content`;

  const token = await getAppAccessToken();

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    // Node Buffer/Uint8Array TS 5.7+ generic backing buffer typing'i nedeniyle
    // BlobPart'a doğrudan oturmuyor; runtime'da sorunsuz, sadece TS noise.
    body: new Blob([buffer as unknown as BlobPart], { type: contentType }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[SharePoint] Dosya yüklenemedi (${fullPath}): ${response.status} ${text}`
    );
  }

  return (await response.json()) as SharePointDriveItem;
}

// ============================================================================
// Item delete
// ============================================================================

/**
 * Drive item'ını siler. Arşiv yolu değiştiğinde (örn. REDDEDİLDİ → revizyon →
 * TAMAMLANDI) eskiyen kopyanın temizliği için kullanılır.
 * 404 başarı sayılır — öğe zaten yok, hedefe ulaşılmış demektir.
 */
export async function deleteSharePointItem(
  driveId: string,
  itemId: string
): Promise<void> {
  const response = await graphAppFetch(`/drives/${driveId}/items/${itemId}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(
      `[SharePoint] Öğe silinemedi (${itemId}): ${response.status} ${text}`
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Site URL'sini Graph API'nin beklediği {hostname, sitePath} çiftine ayırır.
 * Örn: "https://rtenerji.sharepoint.com/sites/RTEnerjiDEVO"
 *      → { hostname: "rtenerji.sharepoint.com", sitePath: "RTEnerjiDEVO" }
 */
function parseSiteUrl(siteUrl: string): { hostname: string; sitePath: string } {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new Error(`[SharePoint] Geçersiz site URL: ${siteUrl}`);
  }

  const match = url.pathname.match(/^\/sites\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(
      `[SharePoint] Beklenmeyen site URL formatı (sites/{name} bekleniyor): ${siteUrl}`
    );
  }

  return { hostname: url.hostname, sitePath: match[1] };
}

/**
 * Path segmentlerini URL-encode eder, slash'leri korur (Graph'ın beklediği format).
 */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
