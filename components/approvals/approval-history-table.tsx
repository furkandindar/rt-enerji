"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PendingApproval } from "@/lib/approvals/types";
import { ApprovalStatusBadge, RequestStatusBadge } from "./status-badge";
import { getRequestSummary } from "@/components/approvals/utils";

interface ApprovalHistoryTableProps {
  history: PendingApproval[];
  /** Vekalet (Faz B): kararı vekaleten verdiyse rozet */
  viewerEmployeeId?: string | null;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onSelect: (approval: PendingApproval) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

export function ApprovalHistoryTable({
  history,
  viewerEmployeeId,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  onSelect,
  onPageChange,
  onPageSizeChange,
}: ApprovalHistoryTableProps) {
  return (
    <div className="flex flex-col gap-4">
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
          <p className="text-muted-foreground">Onay geçmişiniz bulunmuyor</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Talep No</TableHead>
                  <TableHead>Talep Sahibi</TableHead>
                  <TableHead>Talep Tipi</TableHead>
                  <TableHead>Talep Konusu</TableHead>
                  <TableHead>Karar</TableHead>
                  <TableHead>Nihai Karar</TableHead>
                  <TableHead>Karar Tarihi</TableHead>
                  <TableHead className="w-[70px]">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {approval.request.request_no || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {approval.request.requester?.first_name} {approval.request.requester?.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {approval.request.requester?.employee_no}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {approval.request.workflow_definition?.name || "-"}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span
                        className="block truncate"
                        title={getRequestSummary(approval.request)}
                      >
                        {getRequestSummary(approval.request)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <ApprovalStatusBadge status={approval.status} />
                        {viewerEmployeeId &&
                          approval.acted_by_employee_id === viewerEmployeeId &&
                          approval.approver_employee_id !== viewerEmployeeId && (
                            <Badge variant="outline" className="w-fit text-[11px]">
                              Vekaleten
                            </Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={approval.request.status} workflowCode={approval.request.workflow_definition?.code} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {approval.decided_at
                        ? format(new Date(approval.decided_at), "d MMM yyyy HH:mm", { locale: tr })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSelect(approval)}
                        title="Detay Görüntüle"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </div>
  );
}
