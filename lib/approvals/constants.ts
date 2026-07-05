import type { ChecklistItem, ChecklistStatus } from "./types";

// Onboarding checklist section tanımları
export const onboardingSectionConfig: Record<string, { title: string; items: ChecklistItem[] }> = {
  section_2: {
    title: "IT İşlemleri",
    items: [
      { key: "mail_setup", label: "Mail Adresinin Açılması" },
      { key: "mail_groups", label: "Ekleneceği Mail/Sharepoint/Bulut Grupları" },
    ],
  },
  section_3: {
    title: "İK İşlemleri",
    items: [
      { key: "exit_reason_check", label: "İşten Çıkış Sebebi Kontrolü" },
      { key: "sgk_verification", label: "CV/SGK Kontrolü" },
      { key: "pdks_card", label: "PDKS Kayıtları" },
      { key: "guidelines_delivery", label: "Yönergelerin Teslimi" },
      { key: "stationery_request", label: "Kırtasiye Talepleri" },
      { key: "desk_cabinet", label: "Masa/Dolap Tanımı" },
      { key: "phone_setup", label: "Sabit Telefon" },
      { key: "hiring_announcement", label: "İşe Alım Duyurusu" },
      { key: "hospital_notification", label: "Anlaşmalı Hastaneye Yeni Personel Bildirimi" },
      { key: "hospital_rights_notification", label: "Personele, Hastaneye İlişkin Haklarının Bildirimi" },
      { key: "contact_info", label: "Adres/Mobil Bilgileri" },
      { key: "org_chart", label: "Organizasyon Şeması" },
      { key: "sgk_iskur_notification", label: "SGK/İşkur/Emniyet Bildirimleri" },
      { key: "safety_instructions", label: "İş Güvenliği Talimatları" },
      { key: "entry_registration", label: "İşe Giriş İşlemleri" },
      { key: "documents_upload", label: "Evrakların Bulut'a Yüklenmesi" },
    ],
  },
  section_4: {
    title: "Sözleşme İşlemleri",
    items: [
      { key: "contract_signature", label: "İş Sözleşmesi/Zimmet İmzalatılması" },
      { key: "s4_guidelines_delivery", label: "Yönergelerin Teslimi" },
    ],
  },
  section_5: {
    title: "IT İşlemleri",
    items: [
      { key: "computer_setup", label: "Bilgisayar Temini" },
      { key: "qnap_o365_ip", label: "QNAP/O365/IP Telefon Kaydı" },
    ],
  },
  section_6: {
    title: "Diğer",
    items: [
      { key: "smoking_info", label: "Sigara Kullanımı" },
      { key: "evaluation_calendar", label: "Değerlendirme Form Tarihlerinin Takvime Kaydı" },
    ],
  },
};

export const checklistStatusLabels: Record<ChecklistStatus, string> = {
  DONE: "Yapıldı",
  NOT_DONE: "Yapılmadı",
  NA: "Uygulanmaz",
};

export const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
};

export const overtimeTypeLabels: Record<string, string> = {
  EMERGENCY: "Olağan Dışı Durumlar",
  STAFF_SHORTAGE: "Olağan Durumlar",
};

export const financeExpenseAreaLabels: Record<string, string> = {
  ANA_SAHA: "Ana Saha",
  ELEKTRIKSEL_KAPASITE_ARTISI: "Elektriksel Kapasite Artışı",
  YEKA: "YEKA",
};

export const financeFundingSourceLabels: Record<string, string> = {
  KREDI: "Kredi",
  OZ_KAYNAK: "Öz Kaynak",
  NAKIT_FAZLASI: "Nakit Fazlası",
  DIGER: "Diğer",
};

export const accountingCapacityTypeLabels: Record<string, string> = {
  KAPASITE: "Kapasite",
  ANASAHA: "Ana Saha",
  YEKA: "YEKA",
};

export const accountingCapacityTypeShortLabels: Record<string, string> = {
  KAPASITE: "K",
  ANASAHA: "A",
  YEKA: "YEKA",
};

export const overtimeReasonLabels: Record<string, string> = {
  SHIFT_OUTSIDE: "Vardiya Dışı",
  NON_CONTINUOUS: "Sürekli Olmayan",
  EMERGENCY_CASE: "Acil Durumlar",
  SUDDEN_DEVELOPMENT: "Ani Gelişen",
  ON_REQUEST: "Talep Üzerine",
  STAFF_SHORTAGE: "Personel Eksikliği",
  REPORTING: "Raporlama",
  ENERGY_PRODUCTION: "7/24 Enerji Üretimi",
};

export const approvalStatusLabels: Record<string, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onayladı",
  REJECTED: "Reddetti",
  REVISION_REQUESTED: "Revize İstedi",
};

export const approvalStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  REVISION_REQUESTED: "bg-orange-500",
};

export const requestStatusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
  AWAITING_COMPLETION: "RT Onayı",
  COMPLETED: "Tamamlandı",
  REVISION_REQUESTED: "Revize İstendi",
};

// AWAITING_COMPLETION süreçten sürece farklı anlama gelir: ykb_signed_pdf'li
// süreçlerde RT'nin (YKB) ıslak imzası beklenir → "RT Onayı" doğru. Travel'da
// completion'ı göreve giden kişi doldurur, RT dahil değil → farklı etiket.
const workflowStatusLabelOverrides: Record<string, Record<string, string>> = {
  TRAVEL_ASSIGNMENT: {
    AWAITING_COMPLETION: "Görev Dönüşü Bekleniyor",
  },
};

export function getRequestStatusLabel(
  status: string | null | undefined,
  workflowCode?: string | null
): string {
  if (!status) return "";
  return (
    (workflowCode ? workflowStatusLabelOverrides[workflowCode]?.[status] : undefined) ??
    requestStatusLabels[status] ??
    status
  );
}

export const requestStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-gray-400",
  AWAITING_COMPLETION: "bg-blue-500",
  COMPLETED: "bg-green-700",
  REVISION_REQUESTED: "bg-orange-500",
};

export const ONBOARDING_SECTION_KEYS = ['section_2', 'section_3', 'section_4', 'section_5', 'section_6'] as const;

// Separation checklist section tanımları
export const separationSectionConfig: Record<string, { title: string; items: ChecklistItem[] }> = {
  section_2: {
    title: "Bilgi İşlem İşlemleri",
    items: [
      { key: "email_closure", label: "E-posta Hesaplarının Kapatılması / Yönlendirilmesi" },
      { key: "it_access_revocation", label: "Bilgi İşlem Hesaplarının ve Erişimlerin İptali" },
    ],
  },
  section_3: {
    title: "İK İşlemleri",
    items: [
      { key: "exit_documents", label: "İşten Çıkış Evraklarının Hazırlanması" },
      { key: "personnel_list_removal", label: "Personel Listesine Çıkış Kaydının Yapılması" },
      { key: "payroll_processing", label: "Bordro ile İlgili İşlemlerin Yapılması" },
      { key: "advance_check", label: "Personel Avans Kontrolü" },
      { key: "equipment_return", label: "Zimmetli Eşyaların Teslim Alınması / Tutanak" },
      { key: "uniform_return", label: "Zimmetli Kıyafetlerin Teslimi / Tutanak" },
      { key: "hospital_removal", label: "Anlaşmalı Hastane Kayıtlarından Silinmesi İçin Bildirim Yapılması" },
      { key: "access_card_return", label: "Ana Bina ve Ofis Giriş Kartı Teslimi" },
      { key: "security_notification", label: "Çalıştığı Lokasyon Güvenliğe Bilgi Verilmesi" },
      { key: "org_chart_removal", label: "Organizasyon Şemasından Çıkartılması" },
      { key: "sgk_notification", label: "SGK ve Emniyet Bildirimlerinin Yapılması" },
    ],
  },
  section_4: {
    title: "Hukuki İşlemler",
    items: [
      { key: "poa_uyap_revocation", label: "Vekaletname, Yetki Belgesi ve UYAP Kaydı Kontrolü / Azli" },
      { key: "mersis_revocation", label: "Mersis Kayıtları Kontrolü / İptali" },
      { key: "legal_equipment_return", label: "Zimmetli Eşyaların Teslim Alınması / Tutanak" },
    ],
  },
  section_5: {
    title: "Muhasebe İşlemleri",
    items: [
      { key: "expense_form_submission", label: "Personel Harcama Formunun Personel Tarafından Eksiksiz Olarak Teslimi" },
      { key: "expense_form_review", label: "Personel Harcama Formu Muhasebe Kontrolü" },
      { key: "accounting_advance_check", label: "Personel Avans Kontrolü" },
      { key: "bank_institution_access_revocation", label: "Banka ve Kurum Kayıtları Kontrolü / Erişimin Kapatılması (TEİAŞ, EPİAŞ vb.)" },
    ],
  },
  section_6: {
    title: "IT / İdari İşlemler",
    items: [
      { key: "qnap_o365_ip_removal", label: "Bilg/QNAP Arşiv ve Sıfırlama O365 Arşiv IP Telefon Kaydı Kaldırılması" },
      { key: "pc_check", label: "PC Kontrolü (İhtiyaç Halinde Profesyonel Kontrol)" },
    ],
  },
  section_7: {
    title: "Belge Tarama",
    items: [
      { key: "documents_scan", label: "Tüm Belgelerin Taranması" },
    ],
  },
  section_8: {
    title: "Takvim İşlemleri",
    items: [
      { key: "evaluation_calendar_removal", label: "2/6/12. Aylar Değerlendirme Formlarının Takvimden Silinmesi" },
    ],
  },
};

export const SEPARATION_SECTION_KEYS = ['section_2', 'section_3', 'section_4', 'section_5', 'section_6', 'section_7', 'section_8'] as const;

