"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Approval } from "@/lib/approvals/types";
import { getApproverDisplayName } from "@/lib/approvals/types";
import { ApprovalStatusBadge } from "./status-badge";

interface ApprovalHistoryAccordionProps {
  approvals: Approval[];
}

export function ApprovalHistoryAccordion({ approvals }: ApprovalHistoryAccordionProps) {
  if (!approvals || approvals.length === 0) return null;

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="approval-history"
      className="mt-4"
    >
      <AccordionItem value="approval-history">
        <AccordionTrigger className="text-sm font-medium">
          Onay Geçmişi
        </AccordionTrigger>
        <AccordionContent>
          <TooltipProvider>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Adım</TableHead>
                    <TableHead>Onaylayan</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Yorum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals
                    .sort((a, b) => a.sequence_order - b.sequence_order)
                    .map((approval) => (
                      <TableRow key={approval.id}>
                        <TableCell className="font-medium">
                          {approval.workflow_step.step_order}
                        </TableCell>
                        <TableCell>
                          {getApproverDisplayName(approval)}
                        </TableCell>
                        <TableCell>
                          <ApprovalStatusBadge status={approval.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {approval.decided_at
                            ? format(new Date(approval.decided_at), "d MMM yyyy HH:mm", { locale: tr })
                            : "-"}
                        </TableCell>
                        <TableCell className="max-w-[90px] text-xs">
                          {approval.comment ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-help">
                                  {approval.comment}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p className="whitespace-pre-wrap">{approval.comment}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

