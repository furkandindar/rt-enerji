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
import { PendingApprovalsTable } from "@/components/approvals/pending-approvals-table";

// Next.js 16: useApprovals içinde useSearchParams var → Suspense boundary'sinde olmalı.
export default function ApprovalsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ApprovalsPageInner />
    </Suspense>
  );
}

function ApprovalsPageInner() {
  const router = useRouter();
  const {
    pendingApprovals,
    viewerEmployeeId,
    isLoading,
    pendingPage,
    pendingPageSize,
    pendingTotal,
    pendingTotalPages,
    handlePendingPageChange,
    handlePendingPageSizeChange,
    workflowDefinitions,
    pendingWorkflowFilter,
    handlePendingWorkflowFilterChange,
  } = useApprovals({ mode: "pending" });

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
          <h1 className="text-2xl font-bold tracking-tight">Bekleyen Onaylar</h1>
          <p className="text-muted-foreground">
            İşlem yapmanız gereken talepler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={pendingWorkflowFilter} onValueChange={handlePendingWorkflowFilterChange}>
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
        </div>
      </div>

      <PendingApprovalsTable
        approvals={pendingApprovals}
        viewerEmployeeId={viewerEmployeeId}
        onSelect={(approval) => router.push(`/approvals/${approval.id}`)}
        totalCount={pendingTotal}
        currentPage={pendingPage}
        pageSize={pendingPageSize}
        totalPages={pendingTotalPages}
        onPageChange={handlePendingPageChange}
        onPageSizeChange={handlePendingPageSizeChange}
      />
    </div>
  );
}
