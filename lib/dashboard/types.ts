import type { PendingApproval } from "@/lib/approvals/types";

// GET /api/dashboard/workflow-summary cevabı — ana sayfa kartlarını besler.

export interface DashboardRecentRequest {
  id: string;
  request_no: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  workflow_definition: { id: string; code: string; name: string } | null;
}

export interface DashboardRequestCounts {
  /** PENDING + AWAITING_COMPLETION */
  inProgress: number;
  /** REVISION_REQUESTED — talep sahibinden aksiyon bekler */
  revision: number;
  /** APPROVED + COMPLETED */
  approved: number;
  rejected: number;
}

export interface DashboardSummary {
  viewerEmployeeId: string;
  pendingApprovals: {
    total: number;
    /** Onaya geliş sırasına göre (en eski en üstte) ilk birkaç kayıt */
    items: PendingApproval[];
  };
  myRequests: {
    counts: DashboardRequestCounts;
    /** Son hareket gören talepler (updated_at desc) */
    recent: DashboardRecentRequest[];
  };
}
