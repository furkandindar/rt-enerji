"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PdfViewerDialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
}

interface AttachmentPdfViewerProps extends PdfViewerDialogBaseProps {
  attachmentId: string;
  previewUrl?: never;
  downloadUrl?: never;
}

interface CustomPdfViewerProps extends PdfViewerDialogBaseProps {
  attachmentId?: never;
  previewUrl: string;
  downloadUrl: string;
}

type PdfViewerDialogProps = AttachmentPdfViewerProps | CustomPdfViewerProps;

export function PdfViewerDialog(props: PdfViewerDialogProps) {
  const { open, onOpenChange, fileName } = props;
  const [loading, setLoading] = useState(true);

  const resolvedPreviewUrl = props.attachmentId
    ? `/api/attachments/${props.attachmentId}/preview`
    : props.previewUrl;

  const resolvedDownloadUrl = props.attachmentId
    ? `/api/attachments/${props.attachmentId}/download`
    : props.downloadUrl;

  const handleDownload = async () => {
    try {
      if (!resolvedDownloadUrl) throw new Error("İndirme URL'si bulunamadı");
      const response = await fetch(resolvedDownloadUrl);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="truncate text-base">{fileName}</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              İndir
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <iframe
            src={resolvedPreviewUrl}
            className="w-full h-full rounded-md border"
            onLoad={() => setLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
