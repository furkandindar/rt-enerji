"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { ApprovalStatusBadge } from "./status-badge";
import { AttachmentList } from "./attachment-list";
import {
  accountingCapacityTypeLabels,
} from "@/lib/approvals/constants";

interface AccountingApprovalCoverDetailsProps {
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

export function AccountingApprovalCoverDetails({
  approval,
  previousStepAttachments = [],
}: AccountingApprovalCoverDetailsProps) {
  const accounting = approval.request.accounting_approval_cover_request;
  if (!accounting) return null;

  const items = [...(accounting.items || [])].sort((a, b) => a.row_order - b.row_order);
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
            {format(new Date(accounting.request_date), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Sayı</p>
          <p className="text-sm font-semibold">{accounting.document_no}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Konu</p>
        <p className="text-sm font-semibold">{accounting.subject}</p>
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
                  <th className="py-1.5 pr-2 font-medium">Kapasite</th>
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
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {accountingCapacityTypeLabels[it.capacity_type] || it.capacity_type}
                    </td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {formatAmount(it.invoice_amount)}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {formatAmount(it.payable_amount)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={5} className="py-1.5 pr-2 text-right">Toplam</td>
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

      {/* Değerlendirme Alanları (7 boolean) */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-sm font-semibold">Değerlendirme</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Demirbaş kaydı:</span>
          <span className="font-medium">{accounting.demirbas_registered ? "Var" : "Yok"}</span>
          <span className="text-muted-foreground">İrsaliye:</span>
          <span className="font-medium">{accounting.has_dispatch_note ? "Var" : "Yok"}</span>
          <span className="text-muted-foreground">Teslim alan/eden bilgisi:</span>
          <span className="font-medium">{accounting.has_delivery_info ? "Var" : "Yok"}</span>
          <span className="text-muted-foreground">Fatura kaydı – İcmal:</span>
          <span className="font-medium">{accounting.has_invoice_record ? "Var" : "Yok"}</span>
          <span className="text-muted-foreground">Muhasebe programına giriş:</span>
          <span className="font-medium">{accounting.has_accounting_prog_entry ? "Yapıldı" : "Yapılmadı"}</span>
          <span className="text-muted-foreground">Arvento kaydı:</span>
          <span className="font-medium">{accounting.has_arvento_record ? "Var" : "Yok"}</span>
          <span className="text-muted-foreground">Krediden mi ödeniyor?:</span>
          <span className="font-medium">{accounting.paid_from_credit ? "Evet" : "Hayır"}</span>
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
      <AttachmentList attachments={previousStepAttachments} />
    </>
  );
}
