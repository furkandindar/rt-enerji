// Workflow code + sonuç durumu → SharePoint arşiv klasör yolu eşleştirmesi.
// Saf fonksiyon — runtime ortamından bağımsız, kolay test edilir.
//
// Hedef yapı (BT bilgi notu, 04.08.2026):
//   {ROOT}/{YYYY}/{AA-Ay}/Belgeler/{Belge Türü}/{Sonuç}
//
// Örnek:
//   RTProd/2026/07-Temmuz/Belgeler/Yıllık İzin/Tamamlanan
//
// Yıl ve ay talebin OLUŞTURULMA tarihine göre değil, kesin sonuca ulaştığı
// tarihe göre (Europe/Istanbul) belirlenir. Türkçe karakterli segmentler
// güvenlidir — msgraph katmanı segment bazlı percent-encode eder.

import {
  istanbulDateParts,
  type ArchivableStatus,
} from "@/lib/pdf/file-naming";

// ============================================================================
// Workflow code → Belge Türü klasörü (kullanıcıların tanıdığı Türkçe adlar)
// ============================================================================

export const DOCUMENT_TYPE_FOLDERS: Record<string, string> = {
  ANNUAL_LEAVE:              "Yıllık İzin",
  SHORT_LEAVE:               "Kısa Süreli İzin",
  SALARY_ADVANCE:            "Maaş Avansı",
  OVERTIME:                  "Fazla Mesai",
  EMPLOYEE_ONBOARDING:       "İşe Giriş",
  EMPLOYEE_SEPARATION:       "İşten Çıkış",
  REQUEST_FORM:              "Talep Formu",
  TRAVEL_ASSIGNMENT:         "Görev Formu",
  APPROVAL_LETTER:           "Olur Yazısı",
  STAMP_APPROVAL:            "Kaşeli Belge",
  FINANCE_APPROVAL_COVER:    "Onay Kapağı Finans",
  ACCOUNTING_APPROVAL_COVER: "Onay Kapağı Muhasebe",
  COMPARISON_FORM:           "Mukayese Formu",
  EXPENSE_FORM:              "Harcama Formu",
};

// Tanımlanmamış süreç kodu buraya düşer — belge kaybolmaz (99_Diger'in devamı)
export const FALLBACK_TYPE_FOLDER = "Diğer";

// ============================================================================
// Ay klasörleri (index = ay - 1)
// ============================================================================

export const MONTH_FOLDERS = [
  "01-Ocak", "02-Şubat", "03-Mart", "04-Nisan", "05-Mayıs", "06-Haziran",
  "07-Temmuz", "08-Ağustos", "09-Eylül", "10-Ekim", "11-Kasım", "12-Aralık",
] as const;

// ============================================================================
// Sonuç klasörleri — file-naming.ts ARCHIVE_STATUS_TOKEN ile hep eşleşmeli
// ============================================================================

export const RESULT_FOLDERS: Record<ArchivableStatus, string> = {
  APPROVED:  "Tamamlanan",
  COMPLETED: "Tamamlanan",
  REJECTED:  "Reddedilen",
  CANCELLED: "İptal Edilen",
};

// ============================================================================
// Public API
// ============================================================================

export interface BuildArchiveFolderPathParams {
  workflowCode: string | null | undefined;
  status: ArchivableStatus;
  finalizedAt: string | Date;  // requests.completed_at (fallback zinciri caller'da)
  rootFolder: string;          // env SHAREPOINT_ROOT_FOLDER'dan gelir
}

/**
 * Arşiv klasör yolunu üretir:
 *   {rootFolder}/{YYYY}/{AA-Ay}/Belgeler/{Belge Türü}/{Sonuç}
 */
export function buildArchiveFolderPath(
  params: BuildArchiveFolderPathParams
): string {
  const typeFolder =
    (params.workflowCode && DOCUMENT_TYPE_FOLDERS[params.workflowCode]) ||
    FALLBACK_TYPE_FOLDER;

  // Terminal statülerde finalizedAt her zaman dolu; bozuk tarih gelse bile
  // belge kaybolmasın diye defansif bucket kullanılır.
  const parts = istanbulDateParts(params.finalizedAt);
  const year = parts?.year ?? "0000";
  const monthFolder = parts
    ? MONTH_FOLDERS[Number(parts.month) - 1] ?? "00-Bilinmeyen"
    : "00-Bilinmeyen";

  const resultFolder = RESULT_FOLDERS[params.status];

  return `${params.rootFolder}/${year}/${monthFolder}/Belgeler/${typeFolder}/${resultFolder}`;
}

