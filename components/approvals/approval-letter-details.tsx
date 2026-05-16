"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { RichTextDisplay } from "@/components/ui/rich-text-display";
import { AttachmentList } from "./attachment-list";

interface ApprovalLetterDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function ApprovalLetterDetails({ approval, previousStepAttachments = [] }: ApprovalLetterDetailsProps) {
  const letter = approval.request.approval_letter_request;
  if (!letter) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tarih</p>
          <p className="text-sm font-semibold">
            {format(new Date(letter.letter_date), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Firma</p>
          <p className="text-sm font-semibold">{letter.company}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Proje</p>
        <p className="text-sm font-semibold">{letter.project}</p>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Konu</p>
        <p className="text-sm font-semibold">{letter.subject}</p>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Yazı</p>
        <RichTextDisplay content={letter.content} />
      </div>

      {/* Ödeme Tablosu */}
      {letter.has_payment_table && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Ödeme Tablosu</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Karşılaştırma Onay Tarihi:</span>
            <span className="font-medium">
              {letter.comparison_approval_date
                ? format(new Date(letter.comparison_approval_date), "d MMMM yyyy", { locale: tr })
                : "-"}
            </span>
            <span className="text-muted-foreground">Anlaşma Tutarı:</span>
            <span className="font-medium">{letter.agreement_amount || "-"}</span>
            <span className="text-muted-foreground">Sözleşme:</span>
            <span className="font-medium">{letter.has_contract ? "VAR" : "YOK"}</span>
            {(letter.paid_amounts || []).map((amount: string, idx: number) => (
              <div key={idx} className="contents">
                <span className="text-muted-foreground">Ödenen ({idx + 1}):</span>
                <span className="font-medium">{amount || "-"}</span>
              </div>
            ))}
            <span className="text-muted-foreground">Kalan Ödeme:</span>
            <span className="font-medium">{letter.remaining_payment || "-"}</span>
            <span className="text-muted-foreground">Ödenmesi Talep Edilen:</span>
            <span className="font-medium">{letter.requested_payment_amount || "-"}</span>
            <span className="text-muted-foreground">Bu Ödeme Sonrası Kalan:</span>
            <span className="font-medium">{letter.remaining_after_payment || "-"}</span>
          </div>
        </div>
      )}

      {/* Ek Dosyalar */}
      <AttachmentList attachments={previousStepAttachments} />
    </>
  );
}
