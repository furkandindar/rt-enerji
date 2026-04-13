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

interface ApprovalLetterDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function ApprovalLetterDetails({ approval, previousStepAttachments = [] }: ApprovalLetterDetailsProps) {
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
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
        <p className="text-sm font-semibold whitespace-pre-wrap">{letter.content}</p>
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
