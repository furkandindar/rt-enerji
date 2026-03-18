"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, Download, Loader2, Paperclip, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { WorkflowStepAttachmentConfig, RequestAttachment } from "@/lib/workflow/types";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

interface AttachmentUploaderProps {
  requestId: string;
  configs: WorkflowStepAttachmentConfig[];
  existingFiles: RequestAttachment[];
  onUpload: (file: RequestAttachment) => void;
  onDelete: (fileId: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export function AttachmentUploader({
  requestId,
  configs,
  existingFiles,
  onUpload,
  onDelete,
  disabled = false,
  readOnly = false,
}: AttachmentUploaderProps) {
  const [uploadingConfigId, setUploadingConfigId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getMimeTypeLabel = (mimeTypes: string[]): string => {
    return mimeTypes.map((t) => {
      if (t === "application/pdf") return "PDF";
      if (t.startsWith("image/")) return t.replace("image/", "").toUpperCase();
      return t;
    }).join(", ");
  };

  const handleFileSelect = async (configId: string, file: File) => {
    const config = configs.find((c) => c.id === configId);
    if (!config) return;

    // Client-side validasyon
    if (!config.allowed_mime_types.includes(file.type)) {
      toast.error(`Geçersiz dosya tipi. İzin verilen: ${getMimeTypeLabel(config.allowed_mime_types)}`);
      return;
    }

    if (file.size > config.max_file_size_bytes) {
      const maxMB = Math.round(config.max_file_size_bytes / 1048576);
      toast.error(`Dosya boyutu çok büyük. Maksimum: ${maxMB}MB`);
      return;
    }

    const existingForConfig = existingFiles.filter((f) => f.step_attachment_config_id === configId);
    if (existingForConfig.length >= config.max_files) {
      toast.error(`Bu alan için maksimum ${config.max_files} dosya yüklenebilir`);
      return;
    }

    // Upload
    setUploadingConfigId(configId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("request_id", requestId);
      formData.append("step_attachment_config_id", configId);

      const response = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Dosya yüklenemedi");
      }

      const attachment: RequestAttachment = await response.json();
      onUpload(attachment);
      toast.success("Dosya başarıyla yüklendi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dosya yüklenemedi");
    } finally {
      setUploadingConfigId(null);
      // Input'u sıfırla
      const input = fileInputRefs.current[configId];
      if (input) input.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      const response = await fetch(`/api/attachments/${fileId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Dosya silinemedi");
      }

      onDelete(fileId);
      toast.success("Dosya silindi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dosya silinemedi");
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/attachments/${fileId}/download`);
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

  if (configs.length === 0) return null;

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Paperclip className="h-4 w-4" />
        <span>Ek Dosyalar</span>
      </div>

      {configs.map((config) => {
        const filesForConfig = existingFiles.filter(
          (f) => f.step_attachment_config_id === config.id
        );
        const isUploading = uploadingConfigId === config.id;
        const canUploadMore = filesForConfig.length < config.max_files;
        const maxMB = Math.round(config.max_file_size_bytes / 1048576);

        return (
          <div key={config.id} className="rounded-md border p-3 space-y-3">
            {/* Config Label */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {config.label}
                {config.is_required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <span className="text-xs text-muted-foreground">
                {getMimeTypeLabel(config.allowed_mime_types)} · Maks {maxMB}MB
              </span>
            </div>

            {/* Uploaded Files */}
            {filesForConfig.length > 0 && (
              <div className="space-y-2">
                {filesForConfig.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {file.mime_type === "application/pdf" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewFile({ id: file.id, name: file.file_name })}
                          title="Görüntüle"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDownload(file.id, file.file_name)}
                        title="İndir"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(file.id)}
                          disabled={disabled || deletingFileId === file.id}
                          title="Sil"
                        >
                          {deletingFileId === file.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {!readOnly && canUploadMore && (
              <div>
                <input
                  ref={(el) => { fileInputRefs.current[config.id] = el; }}
                  type="file"
                  accept={config.allowed_mime_types.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(config.id, file);
                  }}
                  disabled={disabled || isUploading}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRefs.current[config.id]?.click()}
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
                      Dosya Seç
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {previewFile && (
        <PdfViewerDialog
          open={!!previewFile}
          onOpenChange={(open) => { if (!open) setPreviewFile(null); }}
          attachmentId={previewFile.id}
          fileName={previewFile.name}
        />
      )}
    </div>
  );
}

