// ============================================================================
// PDF Dosya Adı Üretimi - Single Source of Truth
// ============================================================================
//
// İki ayrı format üretilir:
//
// 1. Uygulama içi download/preview (buildPdfFileName):
//      {SURECKODU}_{YYYYMMDD}_{TALEPNO}_{AD-SOYAD}_{DURUM}.pdf
//      IZIN_20260508_2026-000142_AHMET-YILMAZ_ONAYLI.pdf
//
// 2. SharePoint arşivi (buildArchiveFileName — yalnız terminal statüler):
//      {AD-SOYAD}_{YYYY-MM-DD}_{DEPTKOD}_{DEPARTMAN}_{TALEPNO}_{DURUM}.pdf
//      SINEM-ALDOGAN-DEMIRKAN_2026-07-31_IL-01_IZIN-ISLERI_2026-000401_TAMAMLANDI.pdf
//      (tarih = talebin sonuçlandığı gün, Europe/Istanbul)
//
// Sadece [A-Z0-9_-.] karakterleri içerir; cross-OS, SharePoint ve Storage
// uyumlu kalır.
// ============================================================================

import type { Database } from '@/lib/database.types';
import { APP_TZ } from '@/lib/timezone';

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
  REVISION_REQUESTED:   'REVIZE-ISTENDI',
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
// Tarih → Türkiye saatine göre yıl/ay/gün parçaları
// ----------------------------------------------------------------------------
/**
 * Timestamp'i Europe/Istanbul gününe çevirip parçalarını döner.
 * Geçersiz tarih → null. Klasör yolu (folder-mapper) ve dosya adı aynı
 * kaynağı kullansın diye export edildi.
 */
export function istanbulDateParts(
  input: string | Date
): { year: string; month: string; day: string } | null {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return null;
  // Dosya adı, Türkiye saatine göre günü yansıtsın (sunucu UTC olsa bile).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

// ----------------------------------------------------------------------------
// Tarih → YYYYMMDD (alfabetik = kronolojik sıralama için)
// ----------------------------------------------------------------------------
export function formatYYYYMMDD(input: string | Date, separator = ''): string {
  const parts = istanbulDateParts(input);
  if (!parts) return ['0000', '00', '00'].join(separator);
  return [parts.year, parts.month, parts.day].join(separator);
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
// SharePoint arşivi — yalnız terminal (kesin sonuçlu) statüler arşivlenir
// ----------------------------------------------------------------------------
export const ARCHIVABLE_STATUSES = [
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];

export function isArchivableStatus(status: string): status is ArchivableStatus {
  return (ARCHIVABLE_STATUSES as readonly string[]).includes(status);
}

// Arşiv dosya adındaki DURUM parçası. APPROVED ve COMPLETED ikisi de başarılı
// sonuçtur (COMPLETION fazı olmayan süreçler APPROVED'da biter) → tek token.
// Klasör karşılıkları folder-mapper.ts RESULT_FOLDERS'ta; ikisi hep eşleşmeli.
export const ARCHIVE_STATUS_TOKEN: Record<ArchivableStatus, string> = {
  APPROVED:  'TAMAMLANDI',
  COMPLETED: 'TAMAMLANDI',
  REJECTED:  'REDDEDILDI',
  CANCELLED: 'IPTAL',
};

// Departman kodu boşken addan türetilen kısaltmanın üst sınırı
const DEPT_CODE_MAX_LEN = 12;

export interface BuildArchiveFileNameInput {
  request_no: string;                        // 2026-000401
  requester_first_name: string | null | undefined;
  requester_last_name: string | null | undefined;
  finalized_at: string;                      // completed_at ?? last_action_at ?? created_at (caller çözer)
  department_code: string | null;            // organizational_units.code (nullable)
  department_name: string | null;            // organizational_units.name
  status: ArchivableStatus;
}

/**
 * SharePoint arşiv dosya adı:
 *   {AD-SOYAD}_{YYYY-MM-DD}_{DEPTKOD}_{DEPARTMAN}_{TALEPNO}_{DURUM}.pdf
 *
 * Departman, talebin sonuçlandığı anda çözülüp kuyruğa dondurulur — çalışanın
 * departmanı sonradan değişse bile geçmiş belgelerin yeri değişmez.
 */
export function buildArchiveFileName(input: BuildArchiveFileNameInput): string {
  const fullName = [input.requester_first_name, input.requester_last_name]
    .filter(Boolean)
    .join(' ');
  const name = slugifyTr(fullName) || 'ISIMSIZ';

  const date = formatYYYYMMDD(input.finalized_at, '-');

  const deptName = slugifyTr(input.department_name ?? '') || 'BILINMEYEN';
  const derivedCode = input.department_code
    ? slugifyTr(input.department_code)
    : slugifyTr(input.department_name ?? '')
        .slice(0, DEPT_CODE_MAX_LEN)
        .replace(/-+$/, '');
  const deptCode = derivedCode || 'GENEL';

  const status = ARCHIVE_STATUS_TOKEN[input.status];

  return `${name}_${date}_${deptCode}_${deptName}_${input.request_no}_${status}.pdf`;
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
