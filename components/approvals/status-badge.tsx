import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  approvalStatusLabels,
  approvalStatusColors,
  getRequestStatusLabel,
  requestStatusColors,
} from "@/lib/approvals/constants";

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

interface RequestStatusBadgeProps extends StatusBadgeProps {
  /** AWAITING_COMPLETION gibi süreçten sürece anlamı değişen statüler için */
  workflowCode?: string | null;
}

export function RequestStatusBadge({ status, workflowCode, className }: RequestStatusBadgeProps) {
  if (!status) return null;
  return (
    <Badge className={cn(requestStatusColors[status], className)}>
      {getRequestStatusLabel(status, workflowCode)}
    </Badge>
  );
}

export function ApprovalStatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null;
  return (
    <Badge className={cn(approvalStatusColors[status], className)}>
      {approvalStatusLabels[status] ?? status}
    </Badge>
  );
}
