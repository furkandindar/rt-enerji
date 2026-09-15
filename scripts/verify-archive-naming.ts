// SharePoint arşiv adlandırma/klasör saf fonksiyonları için assertion scripti.
// Test framework'ü yok — bu script typecheck sonrası hızlı davranış doğrulaması.
//
// Çalıştırma (repo kökünden):
//   npx tsx scripts/verify-archive-naming.ts
//
// Çıkış kodu: 0 = hepsi geçti, 1 = en az bir assertion düştü.

import {
  ARCHIVABLE_STATUSES,
  ARCHIVE_TYPE_TOKENS,
  buildArchiveFileName,
  formatYYYYMMDD,
  isArchivableStatus,
  istanbulDateParts,
  type ArchivableStatus,
} from "../lib/pdf/file-naming";
import {
  buildArchiveFolderPath,
  FIXED_ROUTE_FOLDERS,
  listStaticArchiveFolders,
  MONTH_FOLDERS,
  normalizeUnitCode,
  resolveArchiveBase,
  RESULT_FOLDERS,
  STANDARD_FORM_FOLDERS,
  UNIT_ARCHIVE_BASES,
} from "../lib/sharepoint/folder-mapper";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) {
    failed++;
    console.error(`✗ ${label}\n    beklenen: ${String(expected)}\n    gelen   : ${String(actual)}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

const AUG = "2026-08-18T09:00:00+03:00";
const ROOT = "RTProd";

// ---------------------------------------------------------------------------
// 1. Dosya adı — bilgi notundaki örnek (birebir, tür eki yok)
// ---------------------------------------------------------------------------
check(
  "bilgi notu örneği (eksiz)",
  buildArchiveFileName({
    request_no: "2026-000401",
    requester_first_name: "Sinem",
    requester_last_name: "Aldoğan Demirkan",
    finalized_at: "2026-07-31T10:00:00+03:00",
    department_code: "IL-01",
    department_name: "İzin İşleri",
    status: "COMPLETED",
  }),
  "SINEM-ALDOGAN-DEMIRKAN_2026-07-31_IL-01_IZIN-ISLERI_2026-000401_TAMAMLANDI.pdf"
);

// ---------------------------------------------------------------------------
// 2. Dosya adı — izin tür eki (TALEPNO ile DURUM arasına)
// ---------------------------------------------------------------------------
check(
  "yıllık izin → YILLIK-IZIN eki",
  buildArchiveFileName({
    request_no: "2026-000512",
    requester_first_name: "Ahmet",
    requester_last_name: "Yılmaz",
    finalized_at: AUG,
    department_code: "BO",
    department_name: "Bakım Onarım Departmanı",
    status: "APPROVED",
    type_token: ARCHIVE_TYPE_TOKENS.ANNUAL_LEAVE,
  }),
  "AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000512_YILLIK-IZIN_TAMAMLANDI.pdf"
);
check(
  "kısa izin → KISA-IZIN eki",
  buildArchiveFileName({
    request_no: "2026-000513",
    requester_first_name: "Ahmet",
    requester_last_name: "Yılmaz",
    finalized_at: AUG,
    department_code: "BO",
    department_name: "Bakım Onarım Departmanı",
    status: "REJECTED",
    type_token: ARCHIVE_TYPE_TOKENS.SHORT_LEAVE,
  }),
  "AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000513_KISA-IZIN_REDDEDILDI.pdf"
);
check(
  "type_token null → eski format",
  buildArchiveFileName({
    request_no: "2026-000514",
    requester_first_name: "Ahmet",
    requester_last_name: "Yılmaz",
    finalized_at: AUG,
    department_code: "BO",
    department_name: "Bakım Onarım Departmanı",
    status: "CANCELLED",
    type_token: null,
  }),
  "AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000514_IPTAL.pdf"
);
check("tür eki yalnız iki izin sürecinde", Object.keys(ARCHIVE_TYPE_TOKENS).sort().join(","), "ANNUAL_LEAVE,SHORT_LEAVE");

// ---------------------------------------------------------------------------
// 3. Klasör — birim bazlı (bireysel süreçler)
// ---------------------------------------------------------------------------
check(
  "BO + yıllık izin → İşletme/Bakım-Onarım/İzin/Tamamlanan/2026/08-Ağustos",
  buildArchiveFolderPath({ workflowCode: "ANNUAL_LEAVE", unitCode: "BO", status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/İşletme/Bakım-Onarım/İzin/Tamamlanan/2026/08-Ağustos"
);
check(
  "Türkçe kod İŞL → Üretim",
  buildArchiveFolderPath({ workflowCode: "TRAVEL_ASSIGNMENT", unitCode: "İŞL", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/İşletme/Üretim/Görev Formu/Tamamlanan/2026/08-Ağustos"
);
check(
  "Türkçe kod TAŞ100 → Taş Havacılık (birimsiz departman, form doğrudan altında)",
  buildArchiveFolderPath({ workflowCode: "REQUEST_FORM", unitCode: "TAŞ100", status: "REJECTED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Taş Havacılık ve Yatçılık/Talep Formu/Reddedilen/2026/08-Ağustos"
);
check(
  "Finans üyesinin kısa izni → Finans/Bireysel Süreçler/İzin",
  buildArchiveFolderPath({ workflowCode: "SHORT_LEAVE", unitCode: "FD", status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Mali ve İdari İşler/Mali İşler/Finans/Bireysel Süreçler/İzin/Tamamlanan/2026/08-Ağustos"
);
check(
  "İK üyesinin harcaması → İnsan Kaynakları/Bireysel Süreçler",
  buildArchiveFolderPath({ workflowCode: "EXPENSE_FORM", unitCode: "IKD", status: "CANCELLED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/İnsan Kaynakları/Bireysel Süreçler/Harcama Formu/İptal Edilen/2026/08-Ağustos"
);
check(
  "Destek Hizmetleri → İdari İşler'e katlanır",
  buildArchiveFolderPath({ workflowCode: "STAMP_APPROVAL", unitCode: "DHD", status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Mali ve İdari İşler/İdari İşler/Kaşeli Onay/Tamamlanan/2026/08-Ağustos"
);
check(
  "İnşaat doğrudan üye (INSID) → Merkez",
  buildArchiveFolderPath({ workflowCode: "COMPARISON_FORM", unitCode: "INSID", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/Merkez/Mukayese Formu/Tamamlanan/2026/08-Ağustos"
);
check(
  "Saha → İnşaat İşleri/Saha",
  buildArchiveFolderPath({ workflowCode: "APPROVAL_LETTER", unitCode: "INSIDS", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/Saha/Olur Yazısı/Tamamlanan/2026/08-Ağustos"
);
check(
  "Hukuk (HMB, birimsiz) → Hukuk Müşavirliği",
  buildArchiveFolderPath({ workflowCode: "ANNUAL_LEAVE", unitCode: "HMB", status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Hukuk Müşavirliği/İzin/Tamamlanan/2026/08-Ağustos"
);
check(
  "GM → Genel Müdürlük",
  buildArchiveFolderPath({ workflowCode: "TRAVEL_ASSIGNMENT", unitCode: "GM", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Genel Müdürlük/Görev Formu/Tamamlanan/2026/08-Ağustos"
);

// ---------------------------------------------------------------------------
// 4. Klasör — sabit rota (talep edenin birimi yok sayılır)
// ---------------------------------------------------------------------------
check(
  "BO üyesinin maaş avansı → İK/Birim Süreçleri (birim yok sayılır)",
  buildArchiveFolderPath({ workflowCode: "SALARY_ADVANCE", unitCode: "BO", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi/Tamamlanan/2026/08-Ağustos"
);
check(
  "KH üyesinin finans kapağı → Finans/Birim Süreçleri",
  buildArchiveFolderPath({ workflowCode: "FINANCE_APPROVAL_COVER", unitCode: "KH", status: "CANCELLED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Mali ve İdari İşler/Mali İşler/Finans/Birim Süreçleri/Onay Kapağı Finans/İptal Edilen/2026/08-Ağustos"
);
check(
  "muhasebe kapağı → Muhasebe/Birim Süreçleri",
  buildArchiveFolderPath({ workflowCode: "ACCOUNTING_APPROVAL_COVER", unitCode: null, status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Mali ve İdari İşler/Mali İşler/Muhasebe/Birim Süreçleri/Onay Kapağı Muhasebe/Tamamlanan/2026/08-Ağustos"
);
check(
  "işe giriş (birim yok) → İK/Birim Süreçleri, fallback değil",
  resolveArchiveBase("EMPLOYEE_ONBOARDING", null).route,
  "fixed"
);

// ---------------------------------------------------------------------------
// 5. Fallback'ler
// ---------------------------------------------------------------------------
check(
  "birim null → Diğer",
  buildArchiveFolderPath({ workflowCode: "EXPENSE_FORM", unitCode: null, status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Diğer/Harcama Formu/Tamamlanan/2026/08-Ağustos"
);
check(
  "bilinmeyen birim kodu → Diğer",
  buildArchiveFolderPath({ workflowCode: "EXPENSE_FORM", unitCode: "XYZ", status: "APPROVED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Diğer/Harcama Formu/Tamamlanan/2026/08-Ağustos"
);
check(
  "kapsayıcı birim (ISLB) eşlenmez → Diğer",
  resolveArchiveBase("EXPENSE_FORM", "ISLB").route,
  "fallback"
);
check(
  "bilinmeyen süreç → {birim}/Diğer",
  buildArchiveFolderPath({ workflowCode: "YENI_SUREC", unitCode: "BO", status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/İşletme/Bakım-Onarım/Diğer/Tamamlanan/2026/08-Ağustos"
);
check(
  "bilinmeyen süreç + bilinmeyen birim → Diğer/Diğer",
  buildArchiveFolderPath({ workflowCode: "YENI_SUREC", unitCode: null, status: "COMPLETED", finalizedAt: AUG, rootFolder: ROOT }),
  "RTProd/Diğer/Diğer/Tamamlanan/2026/08-Ağustos"
);
check("route: birim eşleşti", resolveArchiveBase("ANNUAL_LEAVE", "BO").route, "unit");
check("normalizeUnitCode İŞL → ISL", normalizeUnitCode("İŞL"), "ISL");
check("normalizeUnitCode Oİ → OI", normalizeUnitCode("Oİ"), "OI");
check("normalizeUnitCode null → ''", normalizeUnitCode(null), "");

// ---------------------------------------------------------------------------
// 6. İstanbul gün sınırı — UTC 21:30 = ertesi gün TRT (ay da değişir)
// ---------------------------------------------------------------------------
check(
  "TZ sınırı: 31 Temmuz 21:30 UTC → 2026/08-Ağustos (klasör)",
  buildArchiveFolderPath({ workflowCode: "EXPENSE_FORM", unitCode: "BO", status: "APPROVED", finalizedAt: "2026-07-31T21:30:00Z", rootFolder: ROOT }),
  "RTProd/İşletme/Bakım-Onarım/Harcama Formu/Tamamlanan/2026/08-Ağustos"
);
check("TZ sınırı: dosya adındaki tarih de 08-01", formatYYYYMMDD("2026-07-31T21:30:00Z", "-"), "2026-08-01");

// ---------------------------------------------------------------------------
// 7. Departman fallback'leri (dosya adı)
// ---------------------------------------------------------------------------
check(
  "birim yok → GENEL + BILINMEYEN",
  buildArchiveFileName({
    request_no: "2026-000500",
    requester_first_name: "Ali",
    requester_last_name: "Veli",
    finalized_at: AUG,
    department_code: null,
    department_name: null,
    status: "REJECTED",
  }),
  "ALI-VELI_2026-08-18_GENEL_BILINMEYEN_2026-000500_REDDEDILDI.pdf"
);
check(
  "code boş → addan 12 karakter kısaltma",
  buildArchiveFileName({
    request_no: "2026-000501",
    requester_first_name: "Ayşe",
    requester_last_name: "Kaya",
    finalized_at: AUG,
    department_code: null,
    department_name: "Bilgi Teknolojileri Müdürlüğü",
    status: "CANCELLED",
  }),
  "AYSE-KAYA_2026-08-18_BILGI-TEKNOL_BILGI-TEKNOLOJILERI-MUDURLUGU_2026-000501_IPTAL.pdf"
);
check(
  "kısaltma sonundaki tire kırpılır",
  buildArchiveFileName({
    request_no: "2026-000502",
    requester_first_name: "Can",
    requester_last_name: "Öz",
    finalized_at: AUG,
    department_code: null,
    department_name: "İzin İşleri Şefliği", // slug: IZIN-ISLERI-SEFLIGI → ilk 12: "IZIN-ISLERI-"
    status: "APPROVED",
  }),
  "CAN-OZ_2026-08-18_IZIN-ISLERI_IZIN-ISLERI-SEFLIGI_2026-000502_TAMAMLANDI.pdf"
);

// ---------------------------------------------------------------------------
// 8. Statü kovaları + terminal kapısı
// ---------------------------------------------------------------------------
const expectedFolders: Record<ArchivableStatus, string> = {
  APPROVED: "Tamamlanan",
  COMPLETED: "Tamamlanan",
  REJECTED: "Reddedilen",
  CANCELLED: "İptal Edilen",
};
for (const status of ARCHIVABLE_STATUSES) {
  check(`RESULT_FOLDERS[${status}]`, RESULT_FOLDERS[status], expectedFolders[status]);
}
for (const status of ["DRAFT", "PENDING", "AWAITING_COMPLETION", "REVISION_REQUESTED"]) {
  check(`isArchivableStatus(${status}) = false`, isArchivableStatus(status), false);
}
for (const status of ARCHIVABLE_STATUSES) {
  check(`isArchivableStatus(${status}) = true`, isArchivableStatus(status), true);
}

// ---------------------------------------------------------------------------
// 9. Tablo bütünlüğü — 14 süreç kodu iki tabloya tam bir kez dağılmış olmalı
// ---------------------------------------------------------------------------
const ALL_WORKFLOW_CODES = [
  "ACCOUNTING_APPROVAL_COVER", "ANNUAL_LEAVE", "APPROVAL_LETTER", "COMPARISON_FORM",
  "EMPLOYEE_ONBOARDING", "EMPLOYEE_SEPARATION", "EXPENSE_FORM", "FINANCE_APPROVAL_COVER",
  "OVERTIME", "REQUEST_FORM", "SALARY_ADVANCE", "SHORT_LEAVE", "STAMP_APPROVAL",
  "TRAVEL_ASSIGNMENT",
];
const standardKeys = Object.keys(STANDARD_FORM_FOLDERS);
const fixedKeys = Object.keys(FIXED_ROUTE_FOLDERS);
check("14 süreç kodu", ALL_WORKFLOW_CODES.length, 14);
check("standart + sabit = 14", standardKeys.length + fixedKeys.length, 14);
check(
  "iki tablo kesişmiyor",
  standardKeys.filter((k) => fixedKeys.includes(k)).length,
  0
);
check(
  "her süreç kodu bir tabloda",
  ALL_WORKFLOW_CODES.every((c) => standardKeys.includes(c) || fixedKeys.includes(c)),
  true
);
check("7 standart form klasörü", new Set(Object.values(STANDARD_FORM_FOLDERS)).size, 7);
check("17 farklı birim tabanı", new Set(Object.values(UNIT_ARCHIVE_BASES)).size, 17);
check("12 ay klasörü", MONTH_FOLDERS.length, 12);
check(
  "birim eşleme anahtarları normalize (ASCII büyük harf)",
  Object.keys(UNIT_ARCHIVE_BASES).every((k) => normalizeUnitCode(k) === k),
  true
);

// ---------------------------------------------------------------------------
// 10. Statik ağaç — 17 × 7 × 3 + 6 × 3 = 375 tekil yaprak
// ---------------------------------------------------------------------------
const staticFolders = listStaticArchiveFolders(ROOT);
check("statik ağaç 375 yaprak", staticFolders.length, 375);
check("statik ağaç tekil", new Set(staticFolders).size, staticFolders.length);
check("hepsi kök altında", staticFolders.every((p) => p.startsWith(`${ROOT}/`)), true);
check("Diğer statik ağaçta yok (tembel)", staticFolders.some((p) => p.includes("/Diğer")), false);
check(
  "örnek yaprak: İK/Birim Süreçleri/Maaş Avans Talebi/İptal Edilen",
  staticFolders.includes("RTProd/İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi/İptal Edilen"),
  true
);
check(
  "örnek yaprak: Saha/İzin/Reddedilen",
  staticFolders.includes("RTProd/Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/Saha/İzin/Reddedilen"),
  true
);
check(
  "örnek yaprak: Genel Müdürlük/Görev Formu/Tamamlanan",
  staticFolders.includes("RTProd/Genel Müdürlük/Görev Formu/Tamamlanan"),
  true
);

// ---------------------------------------------------------------------------
// 11. Geriye uyumluluk
// ---------------------------------------------------------------------------
check("formatYYYYMMDD ayraçsız (eski davranış)", formatYYYYMMDD("2026-07-31T10:00:00+03:00"), "20260731");
check("formatYYYYMMDD geçersiz tarih", formatYYYYMMDD("bozuk"), "00000000");
check("istanbulDateParts geçersiz tarih → null", istanbulDateParts("bozuk"), null);

// ---------------------------------------------------------------------------
console.log(failed === 0 ? "\nTüm assertionlar geçti." : `\n${failed} assertion DÜŞTÜ.`);
process.exit(failed === 0 ? 0 : 1);
