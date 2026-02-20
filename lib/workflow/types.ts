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
  previous_shift: string | null;
  next_shift: string | null;
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
  previous_shift: string;
  next_shift: string;
  work_reason: string;
}

export interface CreateOvertimeStaffShortageInput {
  overtime_type: 'STAFF_SHORTAGE';
  month: string;
  year: number;
  reason_category: 'STAFF_SHORTAGE' | 'REPORTING' | 'ENERGY_PRODUCTION';
  reason_detail: string;
  hr_note?: string;
  entries: Array<{
    role_title: string;
    overtime_hours: number;
    overtime_pay: number;
  }>;
}

export type CreateOvertimeInput = CreateOvertimeEmergencyInput | CreateOvertimeStaffShortageInput;
