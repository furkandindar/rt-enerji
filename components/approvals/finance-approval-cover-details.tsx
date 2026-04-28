"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { ApprovalStatusBadge } from "./status-badge";
import {
  financeExpenseAreaLabels,
  financeFundingSourceLabels,
} from "@/lib/approvals/constants";

interface FinanceApprovalCoverDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

const formatAmount = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export function FinanceApprovalCoverDetails({
  approval,
  previousStepAttachments = [],
}: FinanceApprovalCoverDetailsProps) {
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
  const finance = approval.request.finance_approval_cover_request;
  if (!finance) return null;

  const items = [...(finance.items || [])].sort((a, b) => a.row_order - b.row_order);
  const totalInvoice = items.reduce((sum, it) => sum + Number(it.invoice_amount || 0), 0);
  const totalPayable = items.reduce((sum, it) => sum + Number(it.payable_amount || 0), 0);

  // DYNAMIC_USER_LIST tipindeki onaycıları (İlgililer) filtrele
  const relatedApprovals = (approval.request.approvals || [])
    .filter((a) => a.workflow_step?.approver_type === "DYNAMIC_USER_LIST")
    .sort((a, b) => a.sequence_order - b.sequence_order);

  return (
    <>
      {/* Başlık Alanları */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tarih</p>
          <p className="text-sm font-semibold">
            {format(new Date(finance.request_date), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Sayı</p>
          <p className="text-sm font-semibold">{finance.document_no}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Konu</p>
        <p className="text-sm font-semibold">{finance.subject}</p>
      </div>

      {/* Ödeme Tablosu */}
      {items.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Ödeme Kalemleri</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Tarih</th>
                  <th className="py-1.5 pr-2 font-medium">Firma</th>
                  <th className="py-1.5 pr-2 font-medium">Ödenecek</th>
                  <th className="py-1.5 pr-2 font-medium">Konu</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Fatura (TL)</th>
                  <th className="py-1.5 font-medium text-right">Ödenecek (TL)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {format(new Date(it.item_date), "d MMM yyyy", { locale: tr })}
                    </td>
                    <td className="py-1.5 pr-2">{it.company_name}</td>
                    <td className="py-1.5 pr-2">{it.payee_name}</td>
                    <td className="py-1.5 pr-2">{it.item_subject}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {formatAmount(it.invoice_amount)}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {formatAmount(it.payable_amount)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={4} className="py-1.5 pr-2 text-right">Toplam</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    {formatAmount(totalInvoice)}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {formatAmount(totalPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Değerlendirme Alanları */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-sm font-semibold">Değerlendirme</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Hesapta Para:</span>
          <span className="font-medium">{finance.account_available ? "Evet" : "Hayır"}</span>
          <span className="text-muted-foreground">Nakit Akış Kaydı:</span>
          <span className="font-medium">
            {finance.cash_flow_recorded ? "Yapıldı" : "Yapılmadı"}
          </span>
          <span className="text-muted-foreground">Harcama Alanı:</span>
          <span className="font-medium">
            {financeExpenseAreaLabels[finance.expense_area] || finance.expense_area}
          </span>
          <span className="text-muted-foreground">Niteliği:</span>
          <span className="font-medium">
            {financeFundingSourceLabels[finance.funding_source] || finance.funding_source}
          </span>
          <span className="text-muted-foreground">RT Enerji Proforması:</span>
          <span className="font-medium">{finance.has_rt_enerji_proforma ? "Var" : "Yok"}</span>
        </div>
      </div>

      {/* İlgililer (Dinamik Onaycılar) */}
      {relatedApprovals.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">
            İlgililer <span className="text-xs text-muted-foreground font-normal">({relatedApprovals.length})</span>
          </p>
          <div className="space-y-2">
            {relatedApprovals.map((ra) => (
              <div key={ra.id} className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {ra.approver.first_name} {ra.approver.last_name}
                  </p>
                  <ApprovalStatusBadge status={ra.status} className="text-white" />
                </div>
                {ra.decided_at && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(ra.decided_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </p>
                )}
                {ra.comment && (
                  <p className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                    <span className="text-muted-foreground">Not: </span>
                    {ra.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ek Dosyalar */}
      {previousStepAttachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Ek Dosyalar</p>
          <div className="space-y-1.5">
            {previousStepAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(attachment.file_size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {attachment.mime_type === "application/pdf" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewFile({ id: attachment.id, name: attachment.file_name })}
                      title="Görüntüle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/attachments/${attachment.id}/download`);
                        if (!response.ok) throw new Error("Dosya indirilemedi");
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = attachment.file_name;
                        document.body.appendChild(link);
                        link.click();
                        URL.revokeObjectURL(url);
                        document.body.removeChild(link);
                      } catch {
                        toast.error("Dosya indirilemedi");
                      }
                    }}
                    title="İndir"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewFile && (
        <PdfViewerDialog
          open={!!previewFile}
          onOpenChange={(open) => { if (!open) setPreviewFile(null); }}
          attachmentId={previewFile.id}
          fileName={previewFile.name}
        />
      )}
    </>
  );
}
