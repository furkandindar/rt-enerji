"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle2, Loader2, FileText, Trash2, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface YkbSignedPdfUploadProps {
  requestId: string;
  uploadedPath: string | null;
  uploadedFileName: string | null;
  onUploaded: (path: string, fileName: string) => void;
  onCleared: () => void;
  disabled?: boolean;
}

export function YkbSignedPdfUpload({
  requestId,
  uploadedPath,
  uploadedFileName,
  onUploaded,
  onCleared,
  disabled,
}: YkbSignedPdfUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleDownloadOriginal = async () => {
    try {
      const response = await fetch(`/api/requests/${requestId}/pdf`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "PDF indirilemedi");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signed_${requestId}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF indirilemedi");
    }
  };

  const handleFileSelect = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Yalnızca PDF dosyası yüklenebilir");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("Dosya boyutu 25 MB sınırını aşıyor");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("pdf_file", file);
      formData.append("request_id", requestId);

      const response = await fetch("/api/workflow-completion/upload-signed-pdf", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Yükleme başarısız");
      }

      const data = await response.json();
      const path = data.pdf_path as string | undefined;
      if (!path) throw new Error("Sunucudan dosya yolu dönmedi");

      onUploaded(path, file.name);
      toast.success("İmzalı PDF yüklendi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yükleme başarısız");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    onCleared();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-1">
        <Label className="text-sm font-medium">
          İmzalı Form (PDF) <span className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-muted-foreground">
          Yetkili tarafından fiziksel olarak imzalanmış formun taranmış halini yükleyin.
          Yüklenen dosya talebin nihai PDF&apos;i olarak kaydedilecektir.
        </p>
      </div>

      {/* Mevcut otomatik üretilmiş PDF — asistan basıp imzalatır */}
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Aşağıdaki otomatik üretilmiş PDF&apos;i indirip yazdırın, yetkiliye imzalatın ve
          taranmış halini yükleyin.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowPreview(true)}
            disabled={disabled}
          >
            <Eye className="mr-2 h-4 w-4" />
            Görüntüle
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleDownloadOriginal}
            disabled={disabled}
          >
            <Download className="mr-2 h-4 w-4" />
            İndir
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
        disabled={disabled || isUploading}
      />

      {uploadedPath ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50 dark:bg-emerald-950/40 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate" title={uploadedFileName ?? undefined}>
              {uploadedFileName ?? "İmzalı PDF"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              Değiştir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={disabled || isUploading}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Yükleniyor...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              İmzalı PDF Seç
            </>
          )}
        </Button>
      )}

      {showPreview && (
        <PdfViewerDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          previewUrl={`/api/requests/${requestId}/pdf/preview`}
          downloadUrl={`/api/requests/${requestId}/pdf`}
          fileName={`signed_${requestId}.pdf`}
        />
      )}
    </div>
  );
}
