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
  EMERGENCY: "Acil Durum / Talep Üzerine",
  STAFF_SHORTAGE: "Personel Eksikliği / Raporlama",
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
};

export const approvalStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
};

export const requestStatusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
};

export const requestStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-gray-400",
};

export const ONBOARDING_SECTION_KEYS = ['section_2', 'section_3', 'section_4', 'section_5', 'section_6'] as const;

