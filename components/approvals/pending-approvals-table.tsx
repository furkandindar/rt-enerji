"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PendingApproval } from "@/lib/approvals/types";
import { getRequestSummary } from "@/components/approvals/utils";

interface PendingApprovalsTableProps {
  approvals: PendingApproval[];
  onSelect: (approval: PendingApproval) => void;
}

export function PendingApprovalsTable({ approvals, onSelect }: PendingApprovalsTableProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* <div>
        <h2 className="text-lg font-semibold">Bekleyen Onaylar</h2>
        <p className="text-sm text-muted-foreground">
          İşlem yapmanız gereken talepler
        </p>
      </div> */}

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
          <p className="text-muted-foreground">Bekleyen onayınız bulunmuyor</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Talep No</TableHead>
                <TableHead>Talep Sahibi</TableHead>
                <TableHead>Talep Tipi</TableHead>
                <TableHead>Detay</TableHead>
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
                    {approval.request.workflow_definition?.name || "-"}
                  </TableCell>
                  <TableCell>{getRequestSummary(approval)}</TableCell>
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
      )}
    </div>
  );
}

