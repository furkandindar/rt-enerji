import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  approvalStatusLabels,
  approvalStatusColors,
  requestStatusLabels,
  requestStatusColors,
} from "@/lib/approvals/constants";

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function RequestStatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null;
  return (
    <Badge className={cn(requestStatusColors[status], className)}>
      {requestStatusLabels[status] ?? status}
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
