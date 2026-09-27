// Kaşeli Belge Onayı (STAMP_APPROVAL) — POST (/api/stamp-approval) ve PATCH
// (/api/stamp-approval/[requestId]) rotalarının ortak multipart alan
// parse/validasyonu ve orijinal PDF'in Storage yol düzeni.
//
// Mantık POST rotasından birebir taşındı; POST davranışı (hata mesajları,
// toleranslı override parse, sayfa seçimi varsayılanı, dosya yolu) değişmedi.

import type { StampPositionOverrides } from "@/lib/pdf/stamp-pdf";

/** Orijinal ve kaşeli PDF'lerin tutulduğu bucket. */
export const STAMP_PDF_BUCKET = "request-documents";

export type ParsedStampPositionFields =
  | {
      ok: true;
      stampXRatio: number | null;
      stampYRatio: number | null;
      stampPositionOverrides: StampPositionOverrides | null;
    }
  | { ok: false; error: string };

/** "selected_pages" alanı: boş/eksikse "all" (tüm sayfalar). */
export function parseSelectedPages(formData: FormData): string {
  return (formData.get("selected_pages") as string) || "all";
}

/**
 * Serbest konum alanlarını (stamp_x_ratio, stamp_y_ratio, stamp_position_overrides)
 * parse eder.
 * - x/y birlikte gelmeli ve 0-1 aralığında olmalı; ikisi de yoksa null (legacy preset).
 * - Override map'i toleranslı parse edilir: geçersiz JSON 400, geçersiz girişler
 *   sessizce atılır; hiç geçerli giriş kalmazsa null.
 */
export function parseStampPositionFields(formData: FormData): ParsedStampPositionFields {
  const xRatioRaw = formData.get("stamp_x_ratio") as string | null;
  const yRatioRaw = formData.get("stamp_y_ratio") as string | null;
  const overridesRaw = formData.get("stamp_position_overrides") as string | null;

  let stampXRatio: number | null = null;
  let stampYRatio: number | null = null;

  if (xRatioRaw && yRatioRaw) {
    const xNum = parseFloat(xRatioRaw);
    const yNum = parseFloat(yRatioRaw);
    if (!Number.isFinite(xNum) || xNum < 0 || xNum > 1) {
      return { ok: false, error: "stamp_x_ratio 0-1 arasında bir sayı olmalı" };
    }
    if (!Number.isFinite(yNum) || yNum < 0 || yNum > 1) {
      return { ok: false, error: "stamp_y_ratio 0-1 arasında bir sayı olmalı" };
    }
    stampXRatio = xNum;
    stampYRatio = yNum;
  } else if (xRatioRaw || yRatioRaw) {
    return { ok: false, error: "stamp_x_ratio ve stamp_y_ratio birlikte gönderilmeli" };
  }

  // Override map'i tolerantla parse et: geçersiz girişler sessizce atılır
  let stampPositionOverrides: StampPositionOverrides | null = null;
  if (overridesRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(overridesRaw);
    } catch {
      return { ok: false, error: "stamp_position_overrides geçerli JSON olmalı" };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cleaned: StampPositionOverrides = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const pageNum = Number(key);
        if (!Number.isInteger(pageNum) || pageNum < 1) continue;
        if (!value || typeof value !== "object") continue;
        const v = value as { x?: unknown; y?: unknown };
        const xn = typeof v.x === "number" ? v.x : NaN;
        const yn = typeof v.y === "number" ? v.y : NaN;
        if (!Number.isFinite(xn) || xn < 0 || xn > 1) continue;
        if (!Number.isFinite(yn) || yn < 0 || yn > 1) continue;
        cleaned[String(pageNum)] = { x: xn, y: yn };
      }
      stampPositionOverrides = Object.keys(cleaned).length > 0 ? cleaned : null;
    }
  }

  return { ok: true, stampXRatio, stampYRatio, stampPositionOverrides };
}

/** Yeni yüklenen orijinal PDF için benzersiz Storage yolu: YYYY/MM/stamp_<ts>_original.pdf */
export function buildOriginalPdfPath(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const originalFileName = `stamp_${Date.now()}_original.pdf`;
  return `${year}/${month}/${originalFileName}`;
}
