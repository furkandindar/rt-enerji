// Süreç kodu + talep edenin birimi + sonuç durumu → SharePoint arşiv klasör yolu.
// Saf fonksiyonlar — runtime ortamından bağımsız, kolay test edilir.
//
// Hedef yapı (Geliştirme Talebi AS0001 + BYS Arşiv Modülü Teknik Gereksinim,
// 22.08.2026; yıl/ay katmanı kullanıcı kararıyla sonuç klasörünün altına eklendi):
//
//   {ROOT}/{Departman}/{Birim}/{Form Tipi}/{Sonuç}/{YYYY}/{AA-Ay}
//
// İki yönlendirme kuralı:
//   - Sabit rotalı süreçler (onay kapakları + İK birim süreçleri) talep edenin
//     biriminden bağımsız olarak hep aynı "Birim Süreçleri" klasörüne gider.
//   - Kalan süreçler ("bireysel süreçler") talep edenin sonuçlanma anındaki
//     biriminin arşiv tabanı altına, standart form tipi klasörüne gider.
//
// Örnekler:
//   RTProd/İşletme/Bakım-Onarım/İzin/Tamamlanan/2026/08-Ağustos
//   RTProd/İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi/Tamamlanan/2026/08-Ağustos
//
// Yıl ve ay talebin OLUŞTURULMA tarihine göre değil, kesin sonuca ulaştığı
// tarihe göre (Europe/Istanbul) belirlenir. Türkçe karakterli segmentler
// güvenlidir — msgraph katmanı segment bazlı percent-encode eder.

import {
  istanbulDateParts,
  slugifyTr,
  type ArchivableStatus,
} from "@/lib/pdf/file-naming";

// ============================================================================
// Bireysel süreçler: workflow code → standart form tipi klasörü (7 klasör)
// Yıllık ve kısa süreli izin aynı "İzin" klasörünü paylaşır; ayrım dosya
// adındaki tür ekiyle (file-naming.ts ARCHIVE_TYPE_TOKENS) yapılır.
// ============================================================================

export const STANDARD_FORM_FOLDERS: Record<string, string> = {
  TRAVEL_ASSIGNMENT: "Görev Formu",
  REQUEST_FORM:      "Talep Formu",
  STAMP_APPROVAL:    "Kaşeli Onay",
  APPROVAL_LETTER:   "Olur Yazısı",
  COMPARISON_FORM:   "Mukayese Formu",
  EXPENSE_FORM:      "Harcama Formu",
  ANNUAL_LEAVE:      "İzin",
  SHORT_LEAVE:       "İzin",
};

// ============================================================================
// Sabit rotalı süreçler: workflow code → kök altındaki tam taban yolu.
// Talep edenin birimi yok sayılır — belge her zaman ilgili birimin
// "Birim Süreçleri" klasörüne düşer (teknik doküman 5.1, 5.3, 5.4).
// ============================================================================

export const FIXED_ROUTE_FOLDERS: Record<string, string> = {
  FINANCE_APPROVAL_COVER:    "Mali ve İdari İşler/Mali İşler/Finans/Birim Süreçleri/Onay Kapağı Finans",
  ACCOUNTING_APPROVAL_COVER: "Mali ve İdari İşler/Mali İşler/Muhasebe/Birim Süreçleri/Onay Kapağı Muhasebe",
  OVERTIME:                  "İnsan Kaynakları/Birim Süreçleri/Fazla Mesai Formu",
  EMPLOYEE_ONBOARDING:       "İnsan Kaynakları/Birim Süreçleri/İşe Giriş Takip Formu",
  EMPLOYEE_SEPARATION:       "İnsan Kaynakları/Birim Süreçleri/İşten Çıkış Takip Formu",
  SALARY_ADVANCE:            "İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi",
};

// ============================================================================
// Birim eşlemesi: organizational_units.code (slugifyTr ile normalize edilmiş)
// → bireysel süreçlerin yerleştiği arşiv tabanı.
//
// Ağaç DB'den otomatik türetilemez: İK org şemasında İdari İşler altındayken
// arşivde bağımsız departman; Destek Hizmetleri İdari İşler'e katlanır;
// Finans/Muhasebe/İK'nın bireysel süreçleri ayrı alt klasöre iner. Bu yüzden
// açık tablo. Yeni bir birim açıldığında buraya satır eklenmezse belgeler
// kaybolmaz, FALLBACK_UNIT_BASE altına düşer ve enqueue tarafı uyarı loglar.
//
// Not: DB'de üst kutular unit_type "Birim", altındakiler "Departman" olarak
// kayıtlı — teknik dokümanın terminolojisinin tam tersi. Klasör adları
// isimden geldiği için arşivi etkilemez.
// ============================================================================

const ILKHB = "İzin, Lisans ve Harita İşleri";
const ISLB  = "İşletme";
const MIIB  = "Mali ve İdari İşler";
const EIPIB = "Elektrik, İnşaat ve Proje İşleri";

export const UNIT_ARCHIVE_BASES: Record<string, string> = {
  // Taş Havacılık ve Yatçılık — birim yok, formlar doğrudan departman altında
  TAS100: "Taş Havacılık ve Yatçılık",
  TSHY:   "Taş Havacılık ve Yatçılık",

  // İzin, Lisans ve Harita İşleri
  KH: `${ILKHB}/Harita İşleri`,
  IL: `${ILKHB}/İzin İşleri`,
  OI: `${ILKHB}/Orman İşleri`,

  // İşletme
  ISL: `${ISLB}/Üretim`,
  IS:  `${ISLB}/Enerji Satış`,
  BO:  `${ISLB}/Bakım-Onarım`,

  // Mali ve İdari İşler — Finans/Muhasebe üyelerinin kendi (bireysel) süreçleri
  FD:    `${MIIB}/Mali İşler/Finans/Bireysel Süreçler`,
  MD:    `${MIIB}/Mali İşler/Muhasebe/Bireysel Süreçler`,
  IIDEP: `${MIIB}/İdari İşler`,
  DHD:   `${MIIB}/İdari İşler`,

  // İnsan Kaynakları — arşivde bağımsız departman (teknik doküman 5.3)
  IKD: "İnsan Kaynakları/Bireysel Süreçler",

  // Elektrik, İnşaat ve Proje İşleri
  EID:    `${EIPIB}/Elektrik İşleri`,
  GESID:  `${EIPIB}/GES İşleri`,
  INSIDM: `${EIPIB}/İnşaat İşleri/Merkez`,
  INSID:  `${EIPIB}/İnşaat İşleri/Merkez`,   // Merkez/Saha'ya bağlı olmayan doğrudan üye
  INSIDS: `${EIPIB}/İnşaat İşleri/Saha`,

  // Hukuk Müşavirliği — birim yok
  HMB: "Hukuk Müşavirliği",
  HM:  "Hukuk Müşavirliği",

  // Genel Müdürlük / Yönetim Kurulu / asistanlar — dokümanda yer almıyor
  GM:     "Genel Müdürlük",
  GMY100: "Genel Müdürlük",
  YK:     "Genel Müdürlük",
};

// Eşlenmemiş / boş birim buraya düşer (tembel oluşur, statik ağaçta yer almaz)
export const FALLBACK_UNIT_BASE = "Diğer";

// Tanımlanmamış süreç kodu buraya düşer — belge kaybolmaz
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

export type ArchiveRoute = "fixed" | "unit" | "fallback";

export interface ArchiveBase {
  base: string;               // kök altındaki taban (birim veya sabit rota)
  formFolder: string | null;  // bireysel süreçlerde form klasörü; sabit rotada null
  route: ArchiveRoute;        // "fallback" = birim eşlenemedi, Diğer'e düştü
}

/**
 * organizational_units.code → eşleme anahtarı ("İŞL" → "ISL", "TAŞ100" → "TAS100").
 */
export function normalizeUnitCode(code: string | null | undefined): string {
  return code ? slugifyTr(code) : "";
}

/**
 * Süreç + birimden kök altındaki tabanı çözer. Saf; uyarı loglamaz — çağıran
 * `route === "fallback"` ise bağlamıyla (talep no, birim kodu) loglar.
 */
export function resolveArchiveBase(
  workflowCode: string | null | undefined,
  unitCode: string | null | undefined
): ArchiveBase {
  const fixed = workflowCode ? FIXED_ROUTE_FOLDERS[workflowCode] : undefined;
  if (fixed) {
    return { base: fixed, formFolder: null, route: "fixed" };
  }

  const formFolder =
    (workflowCode && STANDARD_FORM_FOLDERS[workflowCode]) || FALLBACK_TYPE_FOLDER;

  const unitBase = UNIT_ARCHIVE_BASES[normalizeUnitCode(unitCode)];
  if (unitBase) {
    return { base: unitBase, formFolder, route: "unit" };
  }

  return { base: FALLBACK_UNIT_BASE, formFolder, route: "fallback" };
}

export interface BuildArchiveFolderPathParams {
  workflowCode: string | null | undefined;
  unitCode: string | null | undefined;  // talep edenin sonuçlanma anındaki birimi
  status: ArchivableStatus;
  finalizedAt: string | Date;           // requests.completed_at (fallback zinciri caller'da)
  rootFolder: string;                   // env SHAREPOINT_ROOT_FOLDER'dan gelir
}

/**
 * Arşiv klasör yolunu üretir:
 *   {rootFolder}/{taban}[/{form}]/{Sonuç}/{YYYY}/{AA-Ay}
 */
export function buildArchiveFolderPath(
  params: BuildArchiveFolderPathParams
): string {
  const { base, formFolder } = resolveArchiveBase(
    params.workflowCode,
    params.unitCode
  );

  // Terminal statülerde finalizedAt her zaman dolu; bozuk tarih gelse bile
  // belge kaybolmasın diye defansif bucket kullanılır.
  const parts = istanbulDateParts(params.finalizedAt);
  const year = parts?.year ?? "0000";
  const monthFolder = parts
    ? MONTH_FOLDERS[Number(parts.month) - 1] ?? "00-Bilinmeyen"
    : "00-Bilinmeyen";

  const resultFolder = RESULT_FOLDERS[params.status];

  const segments = [params.rootFolder, base];
  if (formFolder) segments.push(formFolder);
  segments.push(resultFolder, year, monthFolder);

  return segments.join("/");
}

/**
 * Ağacın statik kısmını (sonuç klasörüne kadar) listeler — boş ağaç oluşturma
 * endpoint'i ve doğrulama scripti aynı listeyi kullanır, ağaç tek kaynaktan
 * türer. Yıl/ay klasörleri ilk belgeyle kendiliğinden açıldığı için, Diğer
 * tabanı da tembel oluştuğu için listede yer almaz.
 */
export function listStaticArchiveFolders(rootFolder: string): string[] {
  const unitBases = Array.from(new Set(Object.values(UNIT_ARCHIVE_BASES)));
  const formFolders = Array.from(new Set(Object.values(STANDARD_FORM_FOLDERS)));
  const resultFolders = Array.from(new Set(Object.values(RESULT_FOLDERS)));
  const fixedBases = Array.from(new Set(Object.values(FIXED_ROUTE_FOLDERS)));

  const paths = new Set<string>();

  for (const base of unitBases) {
    for (const form of formFolders) {
      for (const result of resultFolders) {
        paths.add(`${rootFolder}/${base}/${form}/${result}`);
      }
    }
  }

  for (const base of fixedBases) {
    for (const result of resultFolders) {
      paths.add(`${rootFolder}/${base}/${result}`);
    }
  }

  return Array.from(paths).sort((a, b) => a.localeCompare(b, "tr"));
}
