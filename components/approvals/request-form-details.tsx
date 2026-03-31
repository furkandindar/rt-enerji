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
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
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

