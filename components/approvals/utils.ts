import type { Requester } from "@/lib/approvals/types";
import { leaveTypeLabels, overtimeTypeLabels } from "@/lib/approvals/constants";

export const getRequesterFullName = (requester?: Requester): string => {
  if (!requester) return "-";
  return `${requester.first_name} ${requester.last_name}`;
};

export const getRequesterPosition = (requester?: Requester): string => {
  if (!requester?.employee_positions) return "-";
  const primaryPosition = requester.employee_positions.find(
    (ep) => ep.is_primary && !ep.end_date
  );
  return primaryPosition?.position?.title || "-";
};

// APPROVAL_LIST_SELECT liste satırlarında tipe özel join'lerden yalnız konu
// alanlarını çeker; parametre tipi o dar şekle göre tanımlı. Detay sayfasının
// full nested objeleri de bu tipe atanabilir olduğundan her iki kaynakla çalışır.
export interface RequestSummarySource {
  leave_request?: { leave_type: string } | null;
  salary_advance_request?: { amount: number } | null;
  overtime_request?: { month: string; year: number; overtime_type: 'EMERGENCY' | 'STAFF_SHORTAGE' } | null;
  onboarding_request?: { employee_name: string | null } | null;
  separation_request?: { employee_name: string | null } | null;
  request_form_request?: { subject: string } | null;
  stamp_request?: { subject: string | null } | null;
  travel_assignment_request?: { assignment_subject: string; destination_city: string } | null;
  approval_letter_request?: { subject: string } | null;
  finance_approval_cover_request?: { subject: string } | null;
  accounting_approval_cover_request?: { subject: string } | null;
  mukayese_request?: { subject: string } | null;
  expense_request?: { project_name: string } | null;
}

export const getRequestSummary = (request: RequestSummarySource): string => {
  if (request.leave_request) {
    return leaveTypeLabels[request.leave_request.leave_type] || request.leave_request.leave_type;
  }
  if (request.salary_advance_request) {
    return `${request.salary_advance_request.amount.toLocaleString('tr-TR')} TL`;
  }
  if (request.overtime_request) {
    const ot = request.overtime_request;
    return `${ot.month} ${ot.year} - ${overtimeTypeLabels[ot.overtime_type]}`;
  }
  if (request.onboarding_request) {
    return request.onboarding_request.employee_name || "-";
  }
  if (request.separation_request) {
    return request.separation_request.employee_name || "-";
  }
  if (request.request_form_request) {
    return request.request_form_request.subject || "-";
  }
  if (request.stamp_request) {
    return request.stamp_request.subject || "Kaşeli Belge";
  }
  if (request.travel_assignment_request) {
    return `${request.travel_assignment_request.destination_city} - ${request.travel_assignment_request.assignment_subject}`;
  }
  if (request.approval_letter_request) {
    return request.approval_letter_request.subject || "-";
  }
  if (request.finance_approval_cover_request) {
    return request.finance_approval_cover_request.subject || "-";
  }
  if (request.accounting_approval_cover_request) {
    return request.accounting_approval_cover_request.subject || "-";
  }
  if (request.mukayese_request) {
    return request.mukayese_request.subject || "-";
  }
  if (request.expense_request) {
    return request.expense_request.project_name || "-";
  }
  return "-";
};

