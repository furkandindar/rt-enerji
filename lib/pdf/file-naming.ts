// ============================================================================
// PDF Dosya Adı Üretimi - Single Source of Truth
// ============================================================================
//
// Tüm PDF download endpoint'leri ve ileriki SharePoint sync'i bu helper'ı
// kullanmalıdır. Format:
//
//   {SURECKODU}_{YYYYMMDD}_{TALEPNO}_{AD-SOYAD}_{DURUM}.pdf
//
// Örnek:
//   IZIN_20260508_2026-000142_AHMET-YILMAZ_ONAYLI.pdf
//   MUKAYESE_20260315_2026-000098_AYSE-KAYA_REDDEDILDI.pdf
//
// Sadece [A-Z0-9_-.] karakterleri içerir; cross-OS, SharePoint ve Storage
// uyumlu kalır.
// ============================================================================

import type { Database } from '@/lib/database.types';

type RequestStatus = Database['public']['Enums']['request_status'];

// ----------------------------------------------------------------------------
// Workflow code → dosya adındaki süreç kısaltması
// ----------------------------------------------------------------------------
export const PROCESS_CODE_TO_FILENAME: Record<string, string> = {
  ANNUAL_LEAVE:              'IZIN',
  SHORT_LEAVE:               'KISA-IZIN',
  SALARY_ADVANCE:            'MAAS-AVANS',
  OVERTIME:                  'FAZLA-MESAI',
  EMPLOYEE_ONBOARDING:       'ISE-GIRIS',
  EMPLOYEE_SEPARATION:       'ISTEN-CIKIS',
  REQUEST_FORM:              'TALEP-FORMU',
  TRAVEL_ASSIGNMENT:         'GOREV-FORMU',
  APPROVAL_LETTER:           'OLUR-YAZISI',
  FINANCE_APPROVAL_COVER:    'ONAY-KAPAGI-FIN',
  ACCOUNTING_APPROVAL_COVER: 'ONAY-KAPAGI-MUH',
  COMPARISON_FORM:           'MUKAYESE',
  EXPENSE_FORM:              'HARCAMA',
  STAMP_APPROVAL:            'KASE-ONAY',
};

// ----------------------------------------------------------------------------
// Request status → dosya adındaki durum kısaltması
// ----------------------------------------------------------------------------
export const STATUS_TO_FILENAME: Record<RequestStatus, string> = {
  DRAFT:                'TASLAK',
  PENDING:              'BEKLEMEDE',
  APPROVED:             'ONAYLI',
  AWAITING_COMPLETION:  'TAMAMLANMA-BEKLIYOR',
  COMPLETED:            'TAMAMLANDI',
  REJECTED:             'REDDEDILDI',
  CANCELLED:            'IPTAL',
};

// ----------------------------------------------------------------------------
// Türkçe karakter dönüşümü tablosu
// ----------------------------------------------------------------------------
const TR_CHAR_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'C',
  'ğ': 'g', 'Ğ': 'G',
  'ı': 'i', 'I': 'I',
  'İ': 'I',
  'ö': 'o', 'Ö': 'O',
  'ş': 's', 'Ş': 'S',
  'ü': 'u', 'Ü': 'U',
};

/**
 * Türkçe metni dosya adı için güvenli slug'a çevirir.
 *   - Türkçe karakterleri ASCII karşılıklarına dönüştürür
 *   - Boşlukları ve geçersiz karakterleri "-" yapar
 *   - Üst üste tireleri tek tireye indirir
 *   - Baş/son tireyi kırpar
 *   - Tümünü büyük harfe çevirir
 *
 * Örnek: "Furkan Dindar" → "FURKAN-DINDAR"
 *        "Ali Şahin Öz" → "ALI-SAHIN-OZ"
 */
export function slugifyTr(input: string): string {
  if (!input) return '';

  // 1. Türkçe karakterleri çevir
  let s = input.replace(/[çÇğĞıİöÖşŞüÜI]/g, (ch) => TR_CHAR_MAP[ch] ?? ch);

  // 2. Geçersiz karakterleri "-" yap (sadece [A-Za-z0-9] tutuyoruz)
  s = s.replace(/[^A-Za-z0-9]+/g, '-');

  // 3. Üst üste "-" → tek "-"
  s = s.replace(/-+/g, '-');

  // 4. Baş/son "-" kırp
  s = s.replace(/^-+|-+$/g, '');

  return s.toUpperCase();
}

// ----------------------------------------------------------------------------
// Tarih → YYYYMMDD (alfabetik = kronolojik sıralama için)
// ----------------------------------------------------------------------------
export function formatYYYYMMDD(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '00000000';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ----------------------------------------------------------------------------
// Ana fonksiyon: PDF dosya adı üret
// ----------------------------------------------------------------------------
export interface BuildPdfFileNameInput {
  request_no: string;                 // 2026-000142
  workflow_code: string | null | undefined;  // ANNUAL_LEAVE, vb.
  requester_first_name: string | null | undefined;
  requester_last_name: string | null | undefined;
  status: RequestStatus;
  created_at: string;                 // ISO timestamp
}

export function buildPdfFileName(input: BuildPdfFileNameInput): string {
  const processCode =
    (input.workflow_code && PROCESS_CODE_TO_FILENAME[input.workflow_code]) ||
    'TALEP';

  const date = formatYYYYMMDD(input.created_at);

  const fullName = [input.requester_first_name, input.requester_last_name]
    .filter(Boolean)
    .join(' ');
  const name = slugifyTr(fullName) || 'ISIMSIZ';

  const status = STATUS_TO_FILENAME[input.status] || 'BILINMIYOR';

  return `${processCode}_${date}_${input.request_no}_${name}_${status}.pdf`;
}

// ----------------------------------------------------------------------------
// HTTP Content-Disposition header için RFC 5987 uyumlu encoding
// (Türkçe karakter olmayacak ama defansif — fallback ASCII + UTF-8 versiyon)
// ----------------------------------------------------------------------------
export function buildContentDisposition(
  fileName: string,
  type: 'inline' | 'attachment' = 'attachment'
): string {
  const asciiSafe = fileName.replace(/[^\x20-\x7E]/g, '_');
  const utf8 = encodeURIComponent(fileName);
  return `${type}; filename="${asciiSafe}"; filename*=UTF-8''${utf8}`;
}

/**
 * Content-Disposition header'ından dosya adını çıkarır.
 * RFC 5987 uyumlu — önce `filename*=UTF-8''...` (extended) tercih edilir,
 * yoksa düz `filename="..."` (ASCII) kullanılır.
 *
 * @param headerValue Response.headers.get('Content-Disposition') çıktısı
 * @returns Dosya adı veya null
 */
export function parseContentDispositionFilename(
  headerValue: string | null | undefined
): string | null {
  if (!headerValue) return null;

  // 1. RFC 5987 — filename*=UTF-8''<percent-encoded>
  const extMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (extMatch?.[1]) {
    try {
      return decodeURIComponent(extMatch[1].trim());
    } catch {
      // bozuk encoding — ASCII fallback'e düş
    }
  }

  // 2. Düz filename="..." veya filename=...
  const plainMatch = headerValue.match(/filename=("?)([^";]+)\1/i);
  if (plainMatch?.[2]) {
    return plainMatch[2].trim();
  }

  return null;
}
