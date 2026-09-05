"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { RequestStatusBadge } from "@/components/approvals/status-badge";
import { getRequestSummary } from "@/components/approvals/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PendingApproval } from "@/lib/approvals/types";

interface PendingApprovalsTableProps {
  approvals: PendingApproval[];
  /** Vekalet (Faz B): satırın onaycısı görüntüleyen değilse "Vekaleten" rozeti */
  viewerEmployeeId?: string | null;
  onSelect: (approval: PendingApproval) => void;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

export function PendingApprovalsTable({
  approvals,
  viewerEmployeeId,
  onSelect,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PendingApprovalsTableProps) {
  return (
    <div className="flex flex-col gap-4">
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
          <p className="text-muted-foreground">Bekleyen onayınız bulunmuyor</p>
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
                  <TableHead className="w-[110px]">Durum</TableHead>
                  <TableHead>Oluşturulma</TableHead>
                  <TableHead className="w-[70px]">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
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
                      <div className="flex flex-col gap-1">
                        <span>{approval.request.workflow_definition?.name || "-"}</span>
                        {viewerEmployeeId &&
                          approval.approver_employee_id &&
                          approval.approver_employee_id !== viewerEmployeeId && (
                            <Badge variant="outline" className="w-fit text-[11px]" title="Bu onay size vekaleten düşüyor">
                              Vekaleten
                            </Badge>
                          )}
                      </div>
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
                      <RequestStatusBadge status={approval.request.status} workflowCode={approval.request.workflow_definition?.code} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(approval.request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
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
