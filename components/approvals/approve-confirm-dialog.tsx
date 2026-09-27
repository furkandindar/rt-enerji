"use client";

import { Fragment } from "react";
import { ArrowRight, Flag, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApproverDisplayName, type PendingApproval } from "@/lib/approvals/types";
import { getNextApprovalAfter, getRequestSummary, getRequesterFullName } from "./utils";

interface ApproveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approval: PendingApproval;
  comment: string;
  isSubmitting: boolean;
  onConfirm: () => void;
}

// "İmzala ve Onayla" ile karar arasına giren teyit penceresi. Onay geri
// alınamaz (sonraki adıma bildirim, PDF, arşiv anında tetiklenir); bu yüzden
// onaycıya hangi belgeyi onayladığını ve onayın talebi nereye götüreceğini
// son kez gösteriyoruz. Odak varsayılan olarak "Vazgeç"te — art arda Enter/tık
// yanlışlıkla onaya dönüşmesin.
export function ApproveConfirmDialog({
  open,
  onOpenChange,
  approval,
  comment,
  isSubmitting,
  onConfirm,
}: ApproveConfirmDialogProps) {
  const { request } = approval;
  const summary = getRequestSummary(request);
  const next = getNextApprovalAfter(approval);
  const onBehalfOf = approval.viewer?.is_delegate ? approval.viewer.on_behalf_of : null;
  const trimmedComment = comment.trim();

  const rows = [
    { label: "Talep No", value: request.request_no },
    { label: "Form", value: request.workflow_definition?.name },
    { label: "Talep Eden", value: getRequesterFullName(request.requester) },
    { label: "Konu", value: summary !== "-" ? summary : null },
    { label: "Onay Adımı", value: approval.workflow_step?.name },
    {
      label: "Adına",
      value: onBehalfOf ? `${onBehalfOf.first_name} ${onBehalfOf.last_name} (vekaleten)` : null,
    },
  ].filter((row) => row.value);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        // Gönderim sürerken Esc / dışarı tık pencereyi kapatmasın
        if (!isSubmitting) onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader className="items-center sm:items-start">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle>Onayınızı teyit edin</DialogTitle>
          <DialogDescription>Aşağıdaki talebi onaylamak üzeresiniz.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border bg-muted/40 p-3 text-sm sm:p-4">
          {rows.map((row) => (
            <Fragment key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 break-words font-medium">{row.value}</dd>
            </Fragment>
          ))}
        </dl>

        {next !== undefined && (
          <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            {next ? (
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Flag className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <p className="min-w-0 break-words">
              {next ? (
                <>
                  <span className="text-muted-foreground">Sonraki adım: </span>
                  <span className="font-medium">{next.workflow_step?.name}</span>
                  {" · "}
                  {getApproverDisplayName(next)}
                </>
              ) : (
                <>
                  <span className="font-medium">Bu son adım.</span> Onayınızla talep sonuçlanacak.
                </>
              )}
            </p>
          </div>
        )}

        {trimmedComment && (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Yorumunuz</p>
            <p className="line-clamp-3 break-words border-l-2 pl-3 italic">{trimmedComment}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Onay verildikten sonra geri alınamaz.</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            İmzala ve Onayla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
