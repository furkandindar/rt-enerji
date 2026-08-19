// SharePoint arşiv adlandırma/klasör saf fonksiyonları için assertion scripti.
// Test framework'ü yok — bu script typecheck sonrası hızlı davranış doğrulaması.
//
// Çalıştırma (repo kökünden):
//   npx tsx scripts/verify-archive-naming.ts
//
// Çıkış kodu: 0 = hepsi geçti, 1 = en az bir assertion düştü.

import {
  ARCHIVABLE_STATUSES,
  buildArchiveFileName,
  formatYYYYMMDD,
  isArchivableStatus,
  istanbulDateParts,
  type ArchivableStatus,
} from "../lib/pdf/file-naming";
import {
  buildArchiveFolderPath,
  DOCUMENT_TYPE_FOLDERS,
  MONTH_FOLDERS,
  RESULT_FOLDERS,
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

// ---------------------------------------------------------------------------
// 1. Bilgi notundaki örnek dosya adı (birebir)
// ---------------------------------------------------------------------------
check(
  "bilgi notu örneği",
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
// 2. Klasör yolu — bilgi notundaki örnek ağaç
// ---------------------------------------------------------------------------
check(
  "klasör: Temmuz / Yıllık İzin / Tamamlanan",
  buildArchiveFolderPath({
    workflowCode: "ANNUAL_LEAVE",
    status: "COMPLETED",
    finalizedAt: "2026-07-31T10:00:00+03:00",
    rootFolder: "RTProd",
  }),
  "RTProd/2026/07-Temmuz/Belgeler/Yıllık İzin/Tamamlanan"
);

// ---------------------------------------------------------------------------
// 3. İstanbul gün sınırı — UTC 21:30 = ertesi gün TRT (ay da değişir)
// ---------------------------------------------------------------------------
check(
  "TZ sınırı: 31 Temmuz 21:30 UTC → 1 Ağustos TRT (klasör)",
  buildArchiveFolderPath({
    workflowCode: "EXPENSE_FORM",
    status: "APPROVED",
    finalizedAt: "2026-07-31T21:30:00Z",
    rootFolder: "RTProd",
  }),
  "RTProd/2026/08-Ağustos/Belgeler/Harcama Formu/Tamamlanan"
);
check(
  "TZ sınırı: dosya adındaki tarih de 08-01",
  formatYYYYMMDD("2026-07-31T21:30:00Z", "-"),
  "2026-08-01"
);

// ---------------------------------------------------------------------------
// 4. Departman fallback'leri
// ---------------------------------------------------------------------------
check(
  "birim yok → GENEL + BILINMEYEN",
  buildArchiveFileName({
    request_no: "2026-000500",
    requester_first_name: "Ali",
    requester_last_name: "Veli",
    finalized_at: "2026-08-18T09:00:00+03:00",
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
    finalized_at: "2026-08-18T09:00:00+03:00",
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
    finalized_at: "2026-08-18T09:00:00+03:00",
    department_code: null,
    department_name: "İzin İşleri Şefliği", // slug: IZIN-ISLERI-SEFLIGI → ilk 12: "IZIN-ISLERI-"
    status: "APPROVED",
  }),
  "CAN-OZ_2026-08-18_IZIN-ISLERI_IZIN-ISLERI-SEFLIGI_2026-000502_TAMAMLANDI.pdf"
);

// ---------------------------------------------------------------------------
// 5. Bilinmeyen workflow → Diğer
// ---------------------------------------------------------------------------
check(
  "bilinmeyen workflow → Diğer",
  buildArchiveFolderPath({
    workflowCode: "YENI_SUREC",
    status: "COMPLETED",
    finalizedAt: "2026-08-18T09:00:00+03:00",
    rootFolder: "RTProd",
  }),
  "RTProd/2026/08-Ağustos/Belgeler/Diğer/Tamamlanan"
);

// ---------------------------------------------------------------------------
// 6. Statü kovaları + terminal kapısı
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
// 7. Geriye uyumluluk + sabit tablo bütünlüğü
// ---------------------------------------------------------------------------
check("formatYYYYMMDD ayraçsız (eski davranış)", formatYYYYMMDD("2026-07-31T10:00:00+03:00"), "20260731");
check("formatYYYYMMDD geçersiz tarih", formatYYYYMMDD("bozuk"), "00000000");
check("istanbulDateParts geçersiz tarih → null", istanbulDateParts("bozuk"), null);
check("12 ay klasörü", MONTH_FOLDERS.length, 12);
check("14 belge türü klasörü", Object.keys(DOCUMENT_TYPE_FOLDERS).length, 14);

// ---------------------------------------------------------------------------
console.log(failed === 0 ? "\nTüm assertionlar geçti." : `\n${failed} assertion DÜŞTÜ.`);
process.exit(failed === 0 ? 0 : 1);
