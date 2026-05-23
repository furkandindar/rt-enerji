// Workflow code → SharePoint klasör yolu eşleştirmesi.
// Saf fonksiyon — runtime ortamından bağımsız, kolay test edilir.
//
// Hedef yapı:
//   {ROOT}/Kategori/Talep_Tipi/YYYY/MM/DD
//
// Örnek:
//   Talepler/01_Insan_Kaynaklari/Yillik_Izin/2026/05/17

// ============================================================================
// Workflow code → [Kategori, Talep tipi klasörü]
// ============================================================================

const CATEGORY_MAP: Record<string, [string, string]> = {
  // İnsan Kaynakları
  ANNUAL_LEAVE:              ["01_Insan_Kaynaklari", "Yillik_Izin"],
  SHORT_LEAVE:               ["01_Insan_Kaynaklari", "Kisa_Sureli_Izin"],
  SALARY_ADVANCE:            ["01_Insan_Kaynaklari", "Maas_Avans"],
  OVERTIME:                  ["01_Insan_Kaynaklari", "Fazla_Mesai"],
  EMPLOYEE_ONBOARDING:       ["01_Insan_Kaynaklari", "Ise_Giris"],
  EMPLOYEE_SEPARATION:       ["01_Insan_Kaynaklari", "Isten_Cikis"],
  REQUEST_FORM:              ["01_Insan_Kaynaklari", "Talep_Formu"],

  // Finans
  FINANCE_APPROVAL_COVER:    ["02_Finans", "Onay_Kapagi_Finans"],
  COMPARISON_FORM:           ["02_Finans", "Mukayese"],

  // Muhasebe (Harcama muhasebe onay zincirinde yer alıyor)
  ACCOUNTING_APPROVAL_COVER: ["03_Muhasebe", "Onay_Kapagi_Muhasebe"],
  EXPENSE_FORM:              ["03_Muhasebe", "Harcama"],

  // İdari İşler
  TRAVEL_ASSIGNMENT:         ["04_Idari_Isler", "Gorev_Formu"],
  APPROVAL_LETTER:           ["04_Idari_Isler", "Olur_Yazisi"],
  STAMP_APPROVAL:            ["04_Idari_Isler", "Kaseli_Belge_Onayi"],
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Workflow code ve tarih bilgisinden SharePoint folder yolunu üretir.
 *
 * - Bilinmeyen workflow code'ları "99_Diger" altına gider (defansif default).
 * - rootFolder parametresi env'den (SHAREPOINT_ROOT_FOLDER) gelmesi beklenir;
 *   ezilebilir olması test edilebilirliği artırır.
 */
export function buildSharePointPath(
  workflowCode: string | null | undefined,
  date: Date,
  rootFolder: string = "Talepler"
): string {
  const code = workflowCode ?? "";
  const segments = CATEGORY_MAP[code] ?? ["99_Diger", code || "Bilinmeyen"];

  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${rootFolder}/${segments.join("/")}/${year}/${month}/${day}`;
}
