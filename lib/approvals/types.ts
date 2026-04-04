import { SignatureFont } from "@/lib/signature/types";

export interface EmployeePosition {
  position: {
    id: string;
    title: string;
  };
  is_primary: boolean;
  end_date: string | null;
}

export interface Requester {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string;
  employee_positions: EmployeePosition[];
}

export interface Approver {
  id: string;
  first_name: string;
  last_name: string;
}

export interface WorkflowStep {
  step_order: number;
  name: string;
}

export interface Approval {
  id: string;
  status: string;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
  workflow_step: WorkflowStep;
  approver: Approver;
}

export interface SalaryAdvanceRequest {
  id: string;
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER';
  salary_deduction_consent: boolean;
}

export interface OvertimeEntry {
  id: string;
  full_name: string;
  role_title: string;
  overtime_hours: number;
  overtime_pay: number;
}

export interface OvertimeRequest {
  id: string;
  overtime_type: 'EMERGENCY' | 'STAFF_SHORTAGE';
  month: string;
  year: number;
  reason_category: string;
  reason_detail: string;
  hr_note: string | null;
  work_location: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  previous_shift: string | null;
  next_shift: string | null;
  work_reason: string | null;
  total_hours: number | null;
  total_pay: number | null;
  entries?: OvertimeEntry[];
}

export interface PendingApproval {
  id: string;
  status: string;
  decided_at: string | null;
  workflow_step: {
    id: string;
    name: string;
    step_order: number;
    action_type: 'FILL_AND_SIGN' | 'SIGN_ONLY';
    form_section_key: string | null;
  };
  request: {
    id: string;
    status: string;
    current_step: number;
    created_at: string;
    workflow_definition: {
      name: string;
    };
    requester: Requester;
    leave_request?: {
      leave_type: string;
      start_datetime: string;
      end_datetime: string;
      total_days: number;
      remaining_days: number | null;
      reason: string | null;
      hr_note: string | null;
    };
    salary_advance_request?: SalaryAdvanceRequest;
    overtime_request?: OvertimeRequest;
    onboarding_request?: {
      id: string;
      employee_name: string | null;
      employee_title: string | null;
      department: string | null;
      location: string | null;
      job_description: string | null;
      reporting_manager: string | null;
      start_date: string | null;
      employment_period: string | null;
      [key: string]: string | null | undefined;
    };
    separation_request?: {
      id: string;
      employee_name: string | null;
      employee_title: string | null;
      department: string | null;
      location: string | null;
      job_description: string | null;
      reporting_manager: string | null;
      separation_date: string | null;
      separation_reason: string | null;
      employment_period: string | null;
      annual_leave_days: number | null;
      annual_leave_amount: number | null;
      severance_days: number | null;
      severance_amount: number | null;
      notice_weeks: number | null;
      notice_amount: number | null;
      [key: string]: string | number | null | undefined;
    };
    request_form_request?: {
      id: string;
      requester_name: string;
      company: string;
      request_date: string;
      subject: string;
      content: string;
      quantity: string | null;
      amount: number | null;
      reason: string | null;
      request_type: string;
    };
    stamp_request?: {
      id: string;
      original_pdf_path: string;
      stamped_pdf_path: string | null;
      selected_pages: string;
      stamp_position: string;
      subject: string | null;
      description: string | null;
      stamp: {
        id: string;
        name: string;
        image_path: string;
        width: number;
        height: number;
      };
    };
    approvals?: Approval[];
  };
}

export interface ChecklistItem {
  key: string;
  label: string;
}

export type ChecklistStatus = "DONE" | "NOT_DONE" | "NA";

export interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

