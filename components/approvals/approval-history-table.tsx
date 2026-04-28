"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { getRequestSummary } from "./utils";

interface ApprovalHistoryTableProps {
  history: PendingApproval[];
  paginatedHistory: PendingApproval[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onSelect: (approval: PendingApproval) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

export function ApprovalHistoryTable({
  history,
  paginatedHistory,
  currentPage,
  pageSize,
  totalPages,
  onSelect,
  onPageChange,
  onPageSizeChange,
}: ApprovalHistoryTableProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* <div>
        <h2 className="text-lg font-semibold">Onay Geçmişi</h2>
        <p className="text-sm text-muted-foreground">
          Daha önce onayladığınız veya reddettiğiniz talepler
        </p>
      </div> */}

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
          <p className="text-muted-foreground">Onay geçmişiniz bulunmuyor</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Talep Sahibi</TableHead>
                  <TableHead>Talep Tipi</TableHead>
                  <TableHead>Detay</TableHead>
                  <TableHead>Karar</TableHead>
                  <TableHead>Nihai Karar</TableHead>
                  <TableHead>Karar Tarihi</TableHead>
                  <TableHead className="w-[70px]">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHistory.map((approval) => (
                  <TableRow key={approval.id}>
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
                    <TableCell>{getRequestSummary(approval)}</TableCell>
                    <TableCell>
                      <ApprovalStatusBadge status={approval.status} />
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={approval.request.status} />
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

          {/* Pagination Controls */}
          <PaginationControls
            totalCount={history.length}
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

// --- Pagination Controls ---

interface PaginationControlsProps {
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: string) => void;
}

function PaginationControls({
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Toplam {totalCount} kayıt
        </p>
        <span className="text-muted-foreground">•</span>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">Sayfa başına:</p>
          <Select value={pageSize.toString()} onValueChange={onPageSizeChange}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Önceki
        </Button>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
            const showPage =
              page === 1 ||
              page === totalPages ||
              (page >= currentPage - 1 && page <= currentPage + 1);

            const showEllipsis =
              (page === currentPage - 2 && currentPage > 3) ||
              (page === currentPage + 2 && currentPage < totalPages - 2);

            if (showEllipsis) {
              return <span key={page} className="px-2 text-muted-foreground">...</span>;
            }

            if (!showPage) return null;

            return (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(page)}
                className="w-8 h-8 p-0"
              >
                {page}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Sonraki
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
