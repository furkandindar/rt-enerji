// Workflow Engine Types - V3

// ============================================================================
// ENUM Types (Database ile uyumlu)
// ============================================================================

export type ApproverType = 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION' | 'DYNAMIC_USER_LIST';
export type RequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'AWAITING_COMPLETION' | 'COMPLETED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type LeaveType = 'ANNUAL_LEAVE' | 'SHORT_LEAVE';
export type NotificationType = 'APPROVAL_REQUIRED' | 'REQUEST_APPROVED' | 'REQUEST_REJECTED' | 'REQUEST_CANCELLED';

// V3: Yeni action type
export type ActionType = 'FILL_AND_SIGN' | 'SIGN_ONLY';

// ============================================================================
// Database Table Types
// ============================================================================

export interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_restricted: boolean; // V3: Sadece belirli pozisyonlar başlatabilir mi?
  created_at: string;
  updated_at: string;
}

// Koşullu adım tanımı - condition JSON yapısı
export interface StepCondition {
  field: string;   // Süreç-spesifik tablodaki kolon adı (ör: "advance_requested")
  value: unknown;  // Beklenen değer (ör: true)
}

export type WorkflowStepPhase = 'APPROVAL' | 'COMPLETION';

export interface WorkflowStep {
  id: string;
  workflow_definition_id: string;
  step_order: number;
  name: string;
  approver_type: ApproverType;
  static_position_id: string | null;
  is_required: boolean;
  action_type: ActionType; // V3: FILL_AND_SIGN veya SIGN_ONLY
  form_section_key: string | null; // V3: Hangi form bölümü doldurulacak
  condition: StepCondition | null; // V4: Koşullu adım - null ise her zaman çalışır
  phase: WorkflowStepPhase; // V4: APPROVAL veya COMPLETION
  created_at: string;
}

// V3: Workflow başlatma yetkisi
export interface WorkflowInitiator {
  id: string;
  workflow_definition_id: string;
  position_id: string;
  created_at: string;
}

export interface Request {
  id: string;
  request_no: string;
  workflow_definition_id: string;
  requester_employee_id: string;
  status: RequestStatus;
  current_step: number;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestApproval {
  id: string;
  request_id: string;
  workflow_step_id: string;
  approver_employee_id: string;
  status: ApprovalStatus;
  comment: string | null;
  decided_at: string | null;
  sequence_order: number; // Onay zincirindeki mutlak sıra (DYNAMIC_USER_LIST'te aynı step'e birden fazla satır olabilir)
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  request_id: string;
  leave_type: LeaveType;
  start_datetime: string;
  end_datetime: string;
  total_days: number;
  remaining_days: number | null;
  address_during_leave: string | null;
  reason: string | null;
  overtime_amount: number | null;
  hr_note: string | null; // Personel Müdürlüğü tarafından eklenen not
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ============================================================================
// Extended Types (Joins ile)
// ============================================================================

export interface RequestWithDetails extends Request {
  workflow_definition: WorkflowDefinition;
  requester: {
    id: string;
    first_name: string;
    last_name: string;
    employee_no: string;
  };
  leave_request?: LeaveRequest;
  approvals: RequestApprovalWithDetails[];
}

export interface RequestApprovalWithDetails extends RequestApproval {
  workflow_step: WorkflowStep;
  approver: {
    id: string;
    first_name: string;
    last_name: string;
    employee_no: string;
  };
}

// ============================================================================
// API Input Types
// ============================================================================

export interface CreateLeaveRequestInput {
  workflow_code: 'ANNUAL_LEAVE' | 'SHORT_LEAVE';
  leave_type: LeaveType;
  start_datetime: string;
  end_datetime: string;
  total_days: number;
  address_during_leave?: string;
  reason?: string;
  overtime_amount?: number;
}

export interface ApprovalDecisionInput {
  request_id: string;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
}

// Dinamik onaycı listesi input'u (DYNAMIC_USER_LIST approver type için)
// workflow_step_id → seçilen employee_id'lerin sıralı listesi
export type CreateRequestDynamicApprovers = Record<string, string[]>;

// ============================================================================
// Salary Advance Types
// ============================================================================

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';

export interface SalaryAdvanceRequest {
  id: string;
  request_id: string;
  amount: number;
  salary_deduction_consent: boolean;
  payment_method: PaymentMethod;
  created_at: string;
  updated_at: string;
}

export interface CreateSalaryAdvanceInput {
  amount: number;
  payment_method: PaymentMethod;
  salary_deduction_consent: boolean;
}

// ============================================================================
// Overtime (Fazla Mesai) Types
// ============================================================================

export type OvertimeType = 'EMERGENCY' | 'STAFF_SHORTAGE';

export type OvertimeReasonCategory =
  // EMERGENCY nedenleri
  | 'SHIFT_OUTSIDE'
  | 'NON_CONTINUOUS'
  | 'EMERGENCY_CASE'
  | 'SUDDEN_DEVELOPMENT'
  | 'ON_REQUEST'
  // STAFF_SHORTAGE nedenleri
  | 'STAFF_SHORTAGE'
  | 'REPORTING'
  | 'ENERGY_PRODUCTION';

export interface OvertimeRequest {
  id: string;
  request_id: string;
  overtime_type: OvertimeType;
  month: string;
  year: number;
  reason_category: OvertimeReasonCategory;
  reason_detail: string;
  hr_note: string | null;
  // EMERGENCY only
  work_location: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  previous_shift_start: string | null;
  previous_shift_end: string | null;
  next_shift_start: string | null;
  next_shift_end: string | null;
  work_reason: string | null;
  // STAFF_SHORTAGE only
  total_hours: number | null;
  total_pay: number | null;
  created_at: string;
  updated_at: string;
}

export interface OvertimeEntry {
  id: string;
  overtime_request_id: string;
  full_name: string;
  role_title: string;
  overtime_hours: number;
  overtime_pay: number;
  created_at: string;
}

// API Input Types
export interface CreateOvertimeEmergencyInput {
  overtime_type: 'EMERGENCY';
  month: string;
  year: number;
  reason_category: 'SHIFT_OUTSIDE' | 'NON_CONTINUOUS' | 'EMERGENCY_CASE' | 'SUDDEN_DEVELOPMENT' | 'ON_REQUEST';
  reason_detail: string;
  hr_note?: string;
  work_location: string;
  work_start_date: string;
  work_end_date: string;
  previous_shift_start_date: string;
  previous_shift_start_time: string;
  previous_shift_end_date: string;
  previous_shift_end_time: string;
  next_shift_start_date: string;
  next_shift_start_time: string;
  next_shift_end_date: string;
  next_shift_end_time: string;
  work_reason: string;
}

export interface CreateOvertimeStaffShortageInput {
  overtime_type: 'STAFF_SHORTAGE';
  month: string;
  year: number;
  reason_category: 'STAFF_SHORTAGE' | 'REPORTING' | 'ENERGY_PRODUCTION';
  reason_detail: string;
  hr_note?: string;
  work_location: string;
  entries: Array<{
    full_name: string;
    role_title: string;
    overtime_hours: number;
    overtime_pay: number;
  }>;
}

export type CreateOvertimeInput = CreateOvertimeEmergencyInput | CreateOvertimeStaffShortageInput;

// ============================================================================
// Onboarding (İşe Giriş Takip) Types
// ============================================================================

export type ChecklistStatus = 'DONE' | 'NOT_DONE' | 'NA';

export interface OnboardingRequest {
  id: string;
  request_id: string;

  // Section 1: Temel Bilgiler
  employee_name: string | null;
  employee_title: string | null;
  department: string | null;
  location: string | null;
  job_description: string | null;
  reporting_manager: string | null;
  start_date: string | null;
  employment_period: string | null;

  // Section 2: Mail İşlemleri
  mail_setup_status: ChecklistStatus;
  mail_setup_notes: string | null;
  mail_groups_status: ChecklistStatus;
  mail_groups_notes: string | null;

  // Section 3: İK İşlemleri
  exit_reason_check_status: ChecklistStatus;
  exit_reason_check_notes: string | null;
  sgk_verification_status: ChecklistStatus;
  sgk_verification_notes: string | null;
  pdks_card_status: ChecklistStatus;
  pdks_card_notes: string | null;
  guidelines_delivery_status: ChecklistStatus;
  guidelines_delivery_notes: string | null;
  stationery_request_status: ChecklistStatus;
  stationery_request_notes: string | null;
  desk_cabinet_status: ChecklistStatus;
  desk_cabinet_notes: string | null;
  phone_setup_status: ChecklistStatus;
  phone_setup_notes: string | null;
  hiring_announcement_status: ChecklistStatus;
  hiring_announcement_notes: string | null;
  hospital_notification_status: ChecklistStatus;
  hospital_notification_notes: string | null;
  hospital_rights_notification_status: ChecklistStatus;
  hospital_rights_notification_notes: string | null;
  contact_info_status: ChecklistStatus;
  contact_info_notes: string | null;
  org_chart_status: ChecklistStatus;
  org_chart_notes: string | null;
  sgk_iskur_notification_status: ChecklistStatus;
  sgk_iskur_notification_notes: string | null;
  safety_instructions_status: ChecklistStatus;
  safety_instructions_notes: string | null;
  entry_registration_status: ChecklistStatus;
  entry_registration_notes: string | null;
  documents_upload_status: ChecklistStatus;
  documents_upload_notes: string | null;

  // Section 4: Sözleşme İşlemleri
  contract_signature_status: ChecklistStatus;
  contract_signature_notes: string | null;
  s4_guidelines_delivery_status: ChecklistStatus;
  s4_guidelines_delivery_notes: string | null;

  // Section 5: IT İşlemleri
  computer_setup_status: ChecklistStatus;
  computer_setup_notes: string | null;
  qnap_o365_ip_status: ChecklistStatus;
  qnap_o365_ip_notes: string | null;

  // Section 6: Diğer
  smoking_info_status: ChecklistStatus;
  smoking_info_notes: string | null;
  evaluation_calendar_status: ChecklistStatus;
  evaluation_calendar_notes: string | null;

  created_at: string;
  updated_at: string;
}

// Section 1: IK'nın başlatırken doldurduğu alanlar
export interface CreateOnboardingInput {
  employee_name: string;
  employee_title: string;
  department: string;
  location: string;
  job_description: string;
  reporting_manager: string;
  start_date: string;
  employment_period: string;
}

// ============================================================================
// Separation (İşten Çıkış Takip) Types
// ============================================================================

export interface SeparationRequest {
  id: string;
  request_id: string;

  // Section 1: Temel Bilgiler
  employee_name: string | null;
  employee_title: string | null;
  department: string | null;
  location: string | null;
  job_description: string | null;
  reporting_manager: string | null;
  separation_date: string | null;
  separation_reason: string | null;
  employment_period: string | null;

  // Section 1: Mali Tablo
  annual_leave_days: number;
  annual_leave_amount: number;
  severance_days: number;
  severance_amount: number;
  notice_weeks: number;
  notice_amount: number;

  // Section 2: Bilgi İşlem İşlemleri (CEO)
  email_closure_status: ChecklistStatus;
  email_closure_notes: string | null;
  it_access_revocation_status: ChecklistStatus;
  it_access_revocation_notes: string | null;

  // Section 3: İK İşlemleri (Requester)
  exit_documents_status: ChecklistStatus;
  exit_documents_notes: string | null;
  personnel_list_removal_status: ChecklistStatus;
  personnel_list_removal_notes: string | null;
  payroll_processing_status: ChecklistStatus;
  payroll_processing_notes: string | null;
  advance_check_status: ChecklistStatus;
  advance_check_notes: string | null;
  equipment_return_status: ChecklistStatus;
  equipment_return_notes: string | null;
  uniform_return_status: ChecklistStatus;
  uniform_return_notes: string | null;
  hospital_removal_status: ChecklistStatus;
  hospital_removal_notes: string | null;
  access_card_return_status: ChecklistStatus;
  access_card_return_notes: string | null;
  security_notification_status: ChecklistStatus;
  security_notification_notes: string | null;
  org_chart_removal_status: ChecklistStatus;
  org_chart_removal_notes: string | null;
  sgk_notification_status: ChecklistStatus;
  sgk_notification_notes: string | null;

  // Section 4: Hukuki İşlemler
  poa_uyap_revocation_status: ChecklistStatus;
  poa_uyap_revocation_notes: string | null;
  mersis_revocation_status: ChecklistStatus;
  mersis_revocation_notes: string | null;
  legal_equipment_return_status: ChecklistStatus;
  legal_equipment_return_notes: string | null;

  // Section 5: Muhasebe İşlemleri
  expense_form_submission_status: ChecklistStatus;
  expense_form_submission_notes: string | null;
  expense_form_review_status: ChecklistStatus;
  expense_form_review_notes: string | null;
  accounting_advance_check_status: ChecklistStatus;
  accounting_advance_check_notes: string | null;
  bank_institution_access_revocation_status: ChecklistStatus;
  bank_institution_access_revocation_notes: string | null;

  // Section 6: IT / İdari İşlemler
  qnap_o365_ip_removal_status: ChecklistStatus;
  qnap_o365_ip_removal_notes: string | null;
  pc_check_status: ChecklistStatus;
  pc_check_notes: string | null;

  // Section 7: Belge Tarama
  documents_scan_status: ChecklistStatus;
  documents_scan_notes: string | null;

  // Section 8: Takvim İşlemleri
  evaluation_calendar_removal_status: ChecklistStatus;
  evaluation_calendar_removal_notes: string | null;

  created_at: string;
  updated_at: string;
}

// Section 1: IK'nın başlatırken doldurduğu alanlar
export interface CreateSeparationInput {
  employee_name: string;
  employee_title: string;
  department: string;
  location: string;
  job_description: string;
  reporting_manager: string;
  separation_date: string;
  separation_reason: string;
  employment_period: string;
  annual_leave_days?: number;
  annual_leave_amount?: number;
  severance_days?: number;
  severance_amount?: number;
  notice_weeks?: number;
  notice_amount?: number;
}

// ============================================================================
// Request Form (Talep Formu) Types
// ============================================================================

export type RequestFormType = 'MUTFAK' | 'KIRTASIYE' | 'DIGER';

export interface RequestFormRequest {
  id: string;
  request_id: string;
  requester_name: string;
  company: string;
  request_date: string;
  subject: string;
  content: string;
  quantity: string | null;
  amount: number | null;
  reason: string | null;
  request_type: RequestFormType;
  created_at: string;
  updated_at: string;
}

export interface CreateRequestFormInput {
  requester_name: string;
  company: string;
  request_date: string;
  subject: string;
  content: string;
  quantity?: string;
  amount?: number;
  reason?: string;
  request_type: RequestFormType;
}

// ============================================================================
// Travel Assignment (Şehir İçi/Dışı Görev Formu) Types
// ============================================================================

export type TransportationType = 'COMPANY_VEHICLE' | 'RENTAL_VEHICLE' | 'AIRPLANE' | 'OTHER';

export interface TravelAssignmentRequest {
  id: string;
  request_id: string;
  company_id: string;
  assignment_subject: string;
  destination_city: string;
  destination_institution: string;
  estimated_departure_at: string;
  estimated_return_at: string;
  transportation_type: TransportationType;
  transportation_cost: number;
  accommodation_needed: boolean;
  accommodation_cost: number;
  advance_requested: boolean;
  actual_departure_at: string | null;  // Asistan doldurur (COMPLETION fazı)
  actual_return_at: string | null;     // Asistan doldurur (COMPLETION fazı)
  created_at: string;
  updated_at: string;
}

export interface CreateTravelAssignmentInput {
  company_id: string;
  assignment_subject: string;
  destination_city: string;
  destination_institution: string;
  estimated_departure_at: string;
  estimated_return_at: string;
  transportation_type: TransportationType;
  transportation_cost?: number;
  accommodation_needed: boolean;
  accommodation_cost?: number;
  advance_requested: boolean;
  advance_amount?: number;           // Avans talebi varsa miktar
  advance_subject?: string;          // Avans talebi varsa konu
  advance_content?: string;          // Avans talebi varsa açıklama
}

// ============================================================================
// Approval Letter (Olur Yazısı) Types
// ============================================================================

export interface ApprovalLetterRequest {
  id: string;
  request_id: string;
  letter_date: string;
  company: string;
  project: string;
  subject: string;
  content: string;
  has_payment_table: boolean;
  comparison_approval_date: string | null;
  agreement_amount: string | null;
  has_contract: boolean | null;
  paid_amounts: string[];  // ["100.000 TL", "50.000 EUR", "-"]
  remaining_payment: string | null;
  requested_payment_amount: string | null;
  remaining_after_payment: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApprovalLetterInput {
  letter_date: string;
  company: string;
  project: string;
  subject: string;
  content: string;
  has_payment_table: boolean;
  comparison_approval_date?: string;
  agreement_amount?: string;
  has_contract?: boolean;
  paid_amounts?: string[];
  remaining_payment?: string;
  requested_payment_amount?: string;
  remaining_after_payment?: string;
}

// ============================================================================
// Workflow Attachment Types
// ============================================================================

export interface WorkflowStepAttachmentConfig {
  id: string;
  workflow_step_id: string;
  label: string;
  is_required: boolean;
  allowed_mime_types: string[];
  max_file_size_bytes: number;
  max_files: number;
}

export interface RequestAttachment {
  id: string;
  request_id: string;
  step_attachment_config_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface PreviousStepAttachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  config_label: string;
  section_key: string;
}

// ============================================================================
// Stamp Approval (Kaşeli Belge Onayı) Types
// ============================================================================

export type StampPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';

export interface Stamp {
  id: string;
  name: string;
  image_path: string;
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StampRequest {
  id: string;
  request_id: string;
  stamp_id: string;
  original_pdf_path: string;
  stamped_pdf_path: string | null;
  selected_pages: string; // "all" veya "1,3,5"
  stamp_position: StampPosition;
  subject: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStampApprovalInput {
  stamp_id: string;
  selected_pages: string;
  stamp_position: StampPosition;
  description?: string;
}


// ============================================================================
// Finance Approval Cover (Onay Kapağı Finans) Types
// ============================================================================

export type FinanceExpenseArea =
  | 'ANA_SAHA'
  | 'ELEKTRIKSEL_KAPASITE_ARTISI'
  | 'YEKA';

export type FinanceFundingSource =
  | 'KREDI'
  | 'OZ_KAYNAK'
  | 'NAKIT_FAZLASI'
  | 'DIGER';

export interface FinanceApprovalCoverItem {
  id: string;
  finance_request_id: string;
  row_order: number;
  item_date: string;
  company_name: string;
  payee_name: string;
  item_subject: string;
  invoice_amount: number;
  payable_amount: number;
  created_at: string;
}

export interface FinanceApprovalCoverRequest {
  id: string;
  request_id: string;
  subject: string;
  request_date: string;
  document_no: string;
  account_available: boolean;
  cash_flow_recorded: boolean;
  expense_area: FinanceExpenseArea;
  funding_source: FinanceFundingSource;
  has_rt_enerji_proforma: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFinanceApprovalCoverItemInput {
  item_date: string;
  company_name: string;
  payee_name: string;
  item_subject: string;
  invoice_amount: number;
  payable_amount: number;
}

export interface CreateFinanceApprovalCoverInput {
  subject: string;
  request_date: string;
  document_no: string;
  account_available: boolean;
  cash_flow_recorded: boolean;
  expense_area: FinanceExpenseArea;
  funding_source: FinanceFundingSource;
  has_rt_enerji_proforma: boolean;
  items: CreateFinanceApprovalCoverItemInput[];
  dynamic_approvers?: CreateRequestDynamicApprovers;
}

// ============================================================================
// ONAY KAPAĞI MUHASEBE (Accounting Approval Cover) - Tipler
// ============================================================================

export type AccountingCapacityType =
  | 'KAPASITE'
  | 'ANASAHA'
  | 'YEKA';

export interface AccountingApprovalCoverItem {
  id: string;
  accounting_request_id: string;
  row_order: number;
  item_date: string;
  company_name: string;
  payee_name: string;
  item_subject: string;
  capacity_type: AccountingCapacityType;
  invoice_amount: number;
  payable_amount: number;
  created_at: string;
}

export interface AccountingApprovalCoverRequest {
  id: string;
  request_id: string;
  subject: string;
  request_date: string;
  document_no: string;
  demirbas_registered: boolean;
  has_dispatch_note: boolean;
  has_delivery_info: boolean;
  has_invoice_record: boolean;
  has_accounting_prog_entry: boolean;
  has_arvento_record: boolean;
  paid_from_credit: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountingApprovalCoverItemInput {
  item_date: string;
  company_name: string;
  payee_name: string;
  item_subject: string;
  capacity_type: AccountingCapacityType;
  invoice_amount: number;
  payable_amount: number;
}

export interface CreateAccountingApprovalCoverInput {
  subject: string;
  request_date: string;
  document_no: string;
  demirbas_registered: boolean;
  has_dispatch_note: boolean;
  has_delivery_info: boolean;
  has_invoice_record: boolean;
  has_accounting_prog_entry: boolean;
  has_arvento_record: boolean;
  paid_from_credit: boolean;
  items: CreateAccountingApprovalCoverItemInput[];
  dynamic_approvers?: CreateRequestDynamicApprovers;
}



// ============================================================================
// MUKAYESE FORMU (Comparison Form) - Tipler
// ============================================================================

export type MukayeseCurrency = 'TRY' | 'USD' | 'EUR';
export type MukayeseUnit = 'ADET' | 'SET' | 'GUN';
export type MukayeseRowType = 'ITEM' | 'SUBTOTAL';

export interface MukayeseRequest {
  id: string;
  request_id: string;

  // Header
  project_title: string;
  form_currency: MukayeseCurrency;

  // FX snapshot (oluşturma anında TCMB'den)
  fx_eur_try: number | null;
  fx_usd_try: number | null;
  fx_eur_usd: number | null;
  fx_snapshot_at: string | null;

  form_date: string;
  notes: string | null;

  kdv_rate: number;

  // Footer
  preparer_full_name: string;
  company: string;
  subject: string;
  request_content: string;
  request_amount_text: string;
  request_reason: string;

  created_at: string;
  updated_at: string;
}

export interface MukayeseItem {
  id: string;
  mukayese_request_id: string;
  row_order: number;
  row_type: MukayeseRowType;
  description: string | null;
  quantity: number | null;
  unit: MukayeseUnit | null;
  created_at: string;
}

export interface MukayeseSupplier {
  id: string;
  mukayese_request_id: string;
  column_order: number;
  company_name: string;
  payment_terms: string | null;
  technical_description: string | null;
  delivery_time: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface MukayeseCellPrice {
  id: string;
  mukayese_item_id: string;
  mukayese_supplier_id: string;
  unit_price: number;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Create Input'ları (POST body)
// ----------------------------------------------------------------------------

export interface CreateMukayeseItemInput {
  row_order: number;
  row_type: MukayeseRowType;
  description?: string | null;
  quantity?: number | null;
  unit?: MukayeseUnit | null;
}

export interface CreateMukayeseSupplierInput {
  column_order: number;
  company_name: string;
  payment_terms?: string | null;
  technical_description?: string | null;
  delivery_time?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
}

// Hücre fiyatı row_order × column_order ile referans verilir
// (client'ta henüz UUID yok; RPC fonksiyonu bunları yeni id'lerle eşleştirir)
export interface CreateMukayeseCellPriceInput {
  row_order: number;     // mukayese_items.row_order
  column_order: number;  // mukayese_suppliers.column_order
  unit_price: number;
}

export interface CreateMukayeseInput {
  // Header
  project_title: string;
  form_currency: MukayeseCurrency;
  form_date: string;
  notes?: string | null;
  kdv_rate: number;

  // Footer
  preparer_full_name: string;
  company: string;
  subject: string;
  request_content: string;
  request_amount_text: string;
  request_reason: string;

  // Matrix
  items: CreateMukayeseItemInput[];
  suppliers: CreateMukayeseSupplierInput[];
  prices: CreateMukayeseCellPriceInput[];
}


// ============================================================================
// Expense Form (Harcama Formu) Types
// ============================================================================

export interface ExpenseItem {
  id: string;
  expense_request_id: string;
  row_order: number;
  item_date: string;
  document_no: string | null;
  description: string;
  amount: number;
  created_at: string;
}

export interface ExpenseRequest {
  id: string;
  request_id: string;
  request_date: string;
  project_name: string;
  project_code: string;
  is_travel: boolean;
  work_or_destination: string;
  travel_person_count: number | null;
  travel_date: string | null;
  travel_duration: string | null;
  advance_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseItemInput {
  item_date: string;
  document_no?: string | null;
  description: string;
  amount: number;
}

export interface CreateExpenseFormInput {
  request_date: string;
  project_name: string;
  project_code: string;
  is_travel: boolean;
  work_or_destination: string;
  travel_person_count?: number | null;
  travel_date?: string | null;
  travel_duration?: string | null;
  advance_amount?: number | null;
  items: CreateExpenseItemInput[];
}
