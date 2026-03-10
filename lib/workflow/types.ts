// Workflow Engine Types - V3

// ============================================================================
// ENUM Types (Database ile uyumlu)
// ============================================================================

export type ApproverType = 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION';
export type RequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
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
  previous_shift_start: string;
  previous_shift_end: string;
  next_shift_start: string;
  next_shift_end: string;
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
