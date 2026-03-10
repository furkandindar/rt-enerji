import type { PendingApproval, Requester } from "@/lib/approvals/types";
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

export const getRequestSummary = (approval: PendingApproval): string => {
  if (approval.request.leave_request) {
    return leaveTypeLabels[approval.request.leave_request.leave_type] || approval.request.leave_request.leave_type;
  }
  if (approval.request.salary_advance_request) {
    return `${approval.request.salary_advance_request.amount.toLocaleString('tr-TR')} TL`;
  }
  if (approval.request.overtime_request) {
    const ot = approval.request.overtime_request;
    return `${ot.month} ${ot.year} - ${overtimeTypeLabels[ot.overtime_type]}`;
  }
  if (approval.request.onboarding_request) {
    return approval.request.onboarding_request.employee_name || "-";
  }
  if (approval.request.separation_request) {
    return approval.request.separation_request.employee_name || "-";
  }
  return "-";
};

