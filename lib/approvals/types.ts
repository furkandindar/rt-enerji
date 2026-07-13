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
  approver_type?: 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION' | 'DYNAMIC_USER_LIST';
  phase?: 'APPROVAL' | 'COMPLETION';
  form_section_key?: string | null;
}

export interface Approval {
  id: string;
  status: string;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
  sequence_order: number;
  revision_cycle?: number | null;
  workflow_step: WorkflowStep;
  approver: Approver;
}

// COMPLETION/ykb_signed_pdf adımında PDF'i yükleyen kişi (asistan) sadece teknik
// vekildir; sürecin son onayı şirket sahibi RAMAZAN TAŞ'a aittir. UI'da bu adım
// için onaylayan adı olarak RAMAZAN TAŞ gösterilmelidir.
export function getApproverDisplayName(approval: Pick<Approval, 'workflow_step' | 'approver'>): string {
  const step = approval.workflow_step;
  if (step?.phase === 'COMPLETION' && step?.form_section_key === 'ykb_signed_pdf') {
    return 'RAMAZAN TAŞ';
  }
  return `${approval.approver.first_name} ${approval.approver.last_name}`;
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
  previous_shift_start: string | null;
  previous_shift_end: string | null;
  next_shift_start: string | null;
  next_shift_end: string | null;
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
    request_no: string;
    status: string;
    current_step: number;
    created_at: string;
    updated_at?: string | null;
    pdf_path?: string | null;
    workflow_definition: {
      code?: string;
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
      stamp_x_ratio: number | null;
      stamp_y_ratio: number | null;
      stamp_position_overrides: Record<string, { x: number; y: number }> | null;
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
    travel_assignment_request?: {
      id: string;
      company: { id: string; name: string } | null;
      assignment_subject: string;
      destination_city: string;
      destination_institution: string;
      estimated_departure_at: string;
      estimated_return_at: string;
      transportation_type: string;
      transportation_cost: number;
      accommodation_needed: boolean;
      accommodation_cost: number;
      advance_requested: boolean;
      actual_departure_at: string | null;
      actual_return_at: string | null;
      assignment_summary: string | null;
    };
    approval_letter_request?: {
      id: string;
      letter_date: string;
      company: string;
      project: string;
      subject: string;
      content: string;
      has_payment_table: boolean;
      comparison_approval_date: string | null;
      agreement_amount: string | null;
      has_contract: boolean | null;
      paid_amounts: string[];
      remaining_payment: string | null;
      requested_payment_amount: string | null;
      remaining_after_payment: string | null;
    };
    finance_approval_cover_request?: {
      id: string;
      subject: string;
      request_date: string;
      document_no: string;
      account_available: boolean;
      cash_flow_recorded: boolean;
      expense_area: string;
      funding_source: string;
      has_rt_enerji_proforma: boolean;
      has_payment_table?: boolean | null;
      comparison_approval_date?: string | null;
      agreement_amount?: string | null;
      has_contract?: boolean | null;
      paid_amounts?: string[] | null;
      remaining_payment?: string | null;
      requested_payment_amount?: string | null;
      remaining_after_payment?: string | null;
      items?: Array<{
        id: string;
        row_order: number;
        item_date: string;
        company_name: string;
        payee_name: string;
        item_subject: string;
        invoice_amount: number;
        payable_amount: number;
        currency?: string | null;
      }>;
    };
    accounting_approval_cover_request?: {
      id: string;
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
      items?: Array<{
        id: string;
        row_order: number;
        item_date: string;
        company_name: string;
        payee_name: string;
        item_subject: string;
        capacity_type: string;
        invoice_amount: number;
        payable_amount: number;
        currency?: string | null;
      }>;
    };
    mukayese_request?: {
      id: string;
      project_title: string;
      form_currency: 'TRY' | 'USD' | 'EUR';
      form_date: string;
      preparer_full_name: string;
      company: string;
      subject: string;
      request_content: string;
      request_amount_text: string;
      request_reason: string;
      notes: string | null;
      kdv_rate: number;
      fx_eur_try: number | null;
      fx_usd_try: number | null;
      fx_eur_usd: number | null;
      fx_snapshot_at: string | null;
      items?: Array<{
        id: string;
        row_order: number;
        row_type: 'ITEM' | 'SUBTOTAL';
        description: string | null;
        quantity: number | null;
        unit: 'ADET' | 'SET' | 'GUN' | null;
      }>;
      suppliers?: Array<{
        id: string;
        column_order: number;
        company_name: string;
        payment_terms: string | null;
        technical_description: string | null;
        delivery_time: string | null;
        contact_name: string | null;
        contact_phone: string | null;
      }>;
      prices?: Array<{
        id: string;
        mukayese_item_id: string;
        mukayese_supplier_id: string;
        unit_price: number;
      }>;
    };
    expense_request?: {
      id: string;
      request_date: string;
      project_name: string;
      project_code: string;
      is_travel: boolean;
      work_or_destination: string;
      travel_person_count: number | null;
      travel_date: string | null;
      travel_duration: string | null;
      advance_amount: number | null;
      items?: Array<{
        id: string;
        row_order: number;
        item_date: string;
        document_no: string | null;
        description: string;
        amount: number;
      }>;
    };
    approvals?: Approval[];
    // Faz 1 etkinlik logu: tüm cycle'ların onay kayıtları (API tarafından eklenir).
    all_approvals?: Approval[];
    // Lifecycle son aksiyon snapshot'ı (V5).
    submitted_at?: string | null;
    completed_at?: string | null;
    last_action?: string | null;
    last_action_at?: string | null;
    last_action_by?: string | null;
    current_revision_cycle?: number | null;
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

