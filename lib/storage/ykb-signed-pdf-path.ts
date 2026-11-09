// YKB'nin ıslak imzalı taramasının request-documents bucket'ındaki yolu.
//
// Yükleme ucu (/api/workflow-completion/upload-signed-pdf) yolu üretir; onay ucu
// (/api/approvals/[id]) gövdeden gelen yolu requests.pdf_path'e yazmadan önce
// doğrular. Doğrulama olmadan bir tamamlama adımı sahibi pdf_path'i başka bir
// talebin belgesine çevirip kendi talebinin PDF ucundan (service role) indirebilirdi.

const LEGACY_PATH_RE = /^\d{4}\/\d{2}\/signed_\d+\.pdf$/;

export function buildYkbSignedPdfPath(requestId: string, now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${requestId}_signed_${now.getTime()}.pdf`;
}

/**
 * Yol bu talep için yükleme ucunun ürettiği biçimde mi?
 * Eski biçim ("signed_<ts>.pdf", talep kimliği yok) yalnız 2026-11 geçişinde yüklenip
 * henüz onaylanmamış taramalar için kabul edilir; İK onay formlarının taramaları
 * hiçbir zaman bu biçimde üretilmedi.
 */
export function isValidYkbSignedPdfPath(path: string, requestId: string): boolean {
  const escaped = requestId.replace(/[^0-9a-f-]/gi, "");
  if (escaped !== requestId) return false;
  const current = new RegExp(`^\\d{4}/\\d{2}/${escaped}_signed_\\d+\\.pdf$`, "i");
  return current.test(path) || LEGACY_PATH_RE.test(path);
}
