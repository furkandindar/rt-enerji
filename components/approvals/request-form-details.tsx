"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { AttachmentList } from "./attachment-list";

const requestFormTypeLabels: Record<string, string> = {
  MUTFAK: "Mutfak",
  KIRTASIYE: "Kırtasiye",
  DIGER: "Diğer",
};

interface RequestFormDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function RequestFormDetails({ approval, previousStepAttachments = [] }: RequestFormDetailsProps) {
  const form = approval.request.request_form_request;
  if (!form) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Eden</p>
          <p className="text-sm font-semibold">{form.requester_name || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Şirket</p>
          <p className="text-sm font-semibold">{form.company || "-"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Tarihi</p>
          <p className="text-sm font-semibold">
            {form.request_date
              ? format(new Date(form.request_date), "d MMMM yyyy", { locale: tr })
              : "-"}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Türü</p>
          <p className="text-sm font-semibold">
            {requestFormTypeLabels[form.request_type] || form.request_type}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Konu</p>
        <p className="text-sm font-semibold">{form.subject || "-"}</p>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Talep İçeriği</p>
        <p className="text-sm font-semibold whitespace-pre-wrap">{form.content || "-"}</p>
      </div>
      {form.quantity && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Miktarı</p>
          <p className="text-sm font-semibold">{form.quantity}</p>
        </div>
      )}
      {form.amount != null && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Tutarı</p>
          <p className="text-sm font-semibold">
            {form.amount.toLocaleString("tr-TR")} TL
          </p>
        </div>
      )}
      {form.reason && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Talep Nedeni</p>
          <p className="text-sm font-semibold whitespace-pre-wrap">{form.reason}</p>
        </div>
      )}

      {/* Ek Dosyalar */}
      <AttachmentList attachments={previousStepAttachments} />
    </>
  );
}

