// İK Onay formlarının ekran (client) tarafı ortak tipleri ve biçimlendiricileri.
// PDF tarafı lib/pdf/hr-approval-form-shared.tsx'teki eşdeğerleri kullanır (react-pdf
// bağımlılığı client'a taşınmasın diye ayrı).

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { Tables } from "@/lib/database.types";
import { formatMoney } from "@/lib/currency";

export type OnboardingApprovalRecord = Tables<"onboarding_approval_requests">;
export type SeparationApprovalRecord = Tables<"separation_approval_requests">;

/**
 * PostgREST 1:1 ilişkiyi (request_id UNIQUE) nesne olarak döndürür; eski/alternatif
 * select'lerde dizi gelebileceği için iki biçim de kabul edilir.
 */
export function pickOne<T>(raw: T | T[] | null | undefined): T | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/** 'YYYY-MM-DD' → '15 Ocak 2026'. Salt tarih: timezone dönüşümü yapılmaz. */
export function formatDateOnlyLong(value: string | null | undefined): string {
  if (!value) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), "d MMMM yyyy", { locale: tr });
}

/** 12345.5 → '12.345,50 TL'; boş → '-' */
export function formatTlOrDash(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n, "TRY") : "-";
}

export const HR_APPROVAL_VISIBILITY_NOTE =
  "Ücret bilgisi içerir: yalnız İnsan Kaynakları departmanı, sistem yöneticileri, talep sahibi ve onay zinciri görüntüler.";
