// Yeni talep formlarında (henüz request_id yokken) seçilen ek dosyaların
// limit kontrolü. Reddedilen dosyalar sessizce atılmaz; sebebiyle döndürülür.

export interface AttachmentRules {
  /** null veya boş dizi = tüm türler kabul edilir (API ile aynı semantik) */
  allowedMimeTypes: string[] | null;
  maxFileSizeBytes: number;
  maxFiles: number;
}

export type RejectReason = "TYPE" | "SIZE" | "LIMIT";

export interface RejectedFile {
  name: string;
  reason: RejectReason;
}

export function partitionSelectedFiles(
  current: File[],
  incoming: File[],
  rules: AttachmentRules
): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  const restrictTypes = !!rules.allowedMimeTypes && rules.allowedMimeTypes.length > 0;

  for (const file of incoming) {
    if (restrictTypes && !rules.allowedMimeTypes!.includes(file.type)) {
      rejected.push({ name: file.name, reason: "TYPE" });
    } else if (file.size > rules.maxFileSizeBytes) {
      rejected.push({ name: file.name, reason: "SIZE" });
    } else if (current.length + accepted.length >= rules.maxFiles) {
      rejected.push({ name: file.name, reason: "LIMIT" });
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejected };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatMimeTypes(mimeTypes: string[]): string {
  return mimeTypes
    .map((t) => {
      if (t === "application/pdf") return "PDF";
      if (t.startsWith("image/")) return t.replace("image/", "").toUpperCase();
      return t;
    })
    .join(", ");
}
