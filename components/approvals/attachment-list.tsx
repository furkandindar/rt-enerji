"use client";

import { useState } from "react";
import { FileText, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { openPdfPreview } from "@/lib/pdf/open-preview";

export interface AttachmentListItem {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  config_label: string;
}

interface AttachmentListProps {
  attachments: AttachmentListItem[];
  label?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export function AttachmentList({ attachments, label = "Ek Dosyalar" }: AttachmentListProps) {
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);

  if (attachments.length === 0) return null;

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const response = await fetch(`/api/attachments/${id}/download`);
      if (!response.ok) throw new Error("Dosya indirilemedi");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch {
      toast.error("Dosya indirilemedi");
    }
  };

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="space-y-1.5">
          {attachments.map((attachment) => {
            const hasLabel = Boolean(attachment.config_label);
            const primary = hasLabel ? attachment.config_label : attachment.file_name;
            const sizeStr = formatFileSize(attachment.file_size);
            const secondary = hasLabel
              ? `${attachment.file_name} · ${sizeStr}`
              : sizeStr;
            return (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{primary}</p>
                    <p className="text-xs text-muted-foreground truncate">{secondary}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {attachment.mime_type === "application/pdf" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openPdfPreview(
                          `/api/attachments/${attachment.id}/preview`,
                          () =>
                            setPreviewFile({
                              id: attachment.id,
                              name: attachment.file_name,
                            }),
                        )
                      }
                      title="Görüntüle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment.id, attachment.file_name)}
                    title="İndir"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {previewFile && (
        <PdfViewerDialog
          open={!!previewFile}
          onOpenChange={(open) => {
            if (!open) setPreviewFile(null);
          }}
          attachmentId={previewFile.id}
          fileName={previewFile.name}
        />
      )}
    </>
  );
}
