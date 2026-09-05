"use client";

import { Suspense } from "react";
import { Loader2, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApprovals } from "@/lib/approvals/use-approvals";
import { ApprovalHistoryTable } from "@/components/approvals/approval-history-table";

// Next.js 16: useApprovals içinde useSearchParams var → Suspense boundary'sinde olmalı.
export default function ApprovalsHistoryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ApprovalsHistoryPageInner />
    </Suspense>
  );
}

function ApprovalsHistoryPageInner() {
  const router = useRouter();
  const {
    approvalHistory,
    viewerEmployeeId,
    isLoading,
    historyPage,
    historyPageSize,
    historyTotal,
    historyTotalPages,
    handleHistoryPageChange,
    handleHistoryPageSizeChange,
    workflowDefinitions,
    historyWorkflowFilter,
    historyDecisionFilter,
    handleHistoryWorkflowFilterChange,
    handleHistoryDecisionFilterChange,
  } = useApprovals({ mode: "history" });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Onay Geçmişi</h1>
          <p className="text-muted-foreground">
            Daha önce işlem yaptığınız talepler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={historyWorkflowFilter} onValueChange={handleHistoryWorkflowFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Talep Tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Tipler</SelectItem>
              {workflowDefinitions.map((wf) => (
                <SelectItem key={wf.id} value={wf.code}>
                  {wf.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={historyDecisionFilter} onValueChange={handleHistoryDecisionFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Karar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kararlar</SelectItem>
              <SelectItem value="APPROVED">Onayladım</SelectItem>
              <SelectItem value="REJECTED">Reddettim</SelectItem>
              <SelectItem value="REVISION_REQUESTED">Revize İstedim</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ApprovalHistoryTable
        history={approvalHistory}
        viewerEmployeeId={viewerEmployeeId}
        onSelect={(approval) => router.push(`/approvals/${approval.id}`)}
        totalCount={historyTotal}
        currentPage={historyPage}
        pageSize={historyPageSize}
        totalPages={historyTotalPages}
        onPageChange={handleHistoryPageChange}
        onPageSizeChange={handleHistoryPageSizeChange}
      />
    </div>
  );
}
