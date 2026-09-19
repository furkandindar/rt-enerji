"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  formatFileSize,
  formatMimeTypes,
  partitionSelectedFiles,
  type AttachmentRules,
  type RejectedFile,
  type RejectReason,
} from "@/lib/attachments/pending-files";
import type { FailedUpload } from "@/lib/attachments/upload-attachment";

interface PendingAttachmentsFieldProps {
  label: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  rules: AttachmentRules;
  disabled?: boolean;
}

const REASON_ORDER: RejectReason[] = ["LIMIT", "SIZE", "TYPE"];

// Yeni talep formlarında ek dosya seçimi. Limit/boyut/tür nedeniyle eklenemeyen
// dosyalar sessizce atılmaz: adlarıyla birlikte kalıcı bir uyarıda listelenir.
export function PendingAttachmentsField({
  label,
  files,
  onFilesChange,
  rules,
  disabled = false,
}: PendingAttachmentsFieldProps) {
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const maxMB = Math.round(rules.maxFileSizeBytes / 1048576);
  const restrictTypes = !!rules.allowedMimeTypes && rules.allowedMimeTypes.length > 0;
  const typesLabel = restrictTypes ? formatMimeTypes(rules.allowedMimeTypes!) : null;
  const isFull = files.length >= rules.maxFiles;

  const reasonTitle = (reason: RejectReason): string => {
    if (reason === "LIMIT") return `En fazla ${rules.maxFiles} dosya yükleyebilirsiniz. Eklenmeyen dosyalar:`;
    if (reason === "SIZE") return `Dosya boyutu sınırını (${maxMB} MB) aştığı için yüklenemeyen dosyalar:`;
    return `Desteklenmeyen dosya türü${typesLabel ? ` (yalnızca ${typesLabel} kabul edilir)` : ""}. Kabul edilmeyen dosyalar:`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    e.target.value = "";
    if (incoming.length === 0) return;

    const result = partitionSelectedFiles(files, incoming, rules);
    if (result.accepted.length > 0) {
      onFilesChange([...files, ...result.accepted]);
    }
    setRejected(result.rejected);
    if (result.rejected.length > 0) {
      toast.error(`${result.rejected.length} dosya eklenemedi. Ayrıntılar dosya alanında listelendi.`);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs text-muted-foreground">
          {files.length}/{rules.maxFiles} dosya
        </span>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
            >
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => removeFile(index)}
                disabled={disabled}
                aria-label="Dosyayı kaldır"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              {REASON_ORDER.map((reason) => {
                const names = rejected.filter((r) => r.reason === reason).map((r) => r.name);
                if (names.length === 0) return null;
                return (
                  <div key={reason}>
                    <p className="font-medium text-destructive">{reasonTitle(reason)}</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {names.map((name, i) => (
                        <li key={`${name}-${i}`} className="break-all">{name}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setRejected([])}
              aria-label="Uyarıyı kapat"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={restrictTypes ? rules.allowedMimeTypes!.join(",") : undefined}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isFull}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isFull}
        >
          <Upload className="mr-2 h-4 w-4" />
          Dosya Seç
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          {isFull
            ? `Maksimum dosya sayısına (${rules.maxFiles}) ulaştınız. Yeni dosya eklemek için listeden dosya kaldırın.`
            : `Maksimum ${rules.maxFiles} dosya, her biri en fazla ${maxMB} MB${typesLabel ? ` (${typesLabel})` : ""}.`}
        </p>
      </div>
    </div>
  );
}

// Talep oluşturulduktan sonra yüklenemeyen dosyaları adı ve sebebiyle,
// kullanıcı kapatana kadar ekranda kalan bir uyarıda gösterir.
export function showFailedUploadsToast(failed: FailedUpload[]) {
  if (failed.length === 0) return;
  toast.error(`Talep oluşturuldu ancak ${failed.length} dosya yüklenemedi`, {
    duration: Infinity,
    closeButton: true,
    description: (
      <ul className="list-disc list-inside">
        {failed.map((f, i) => (
          <li key={`${f.name}-${i}`} className="break-all">
            {f.name}: {f.error}
          </li>
        ))}
      </ul>
    ),
  });
}
