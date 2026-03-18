"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PendingApproval, ChecklistStatus } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { separationSectionConfig, checklistStatusLabels } from "@/lib/approvals/constants";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

interface SeparationRequestDetailsProps {
  approval: PendingApproval;
  separationSectionKey: string;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function SeparationRequestDetails({ approval, separationSectionKey, previousStepAttachments = [] }: SeparationRequestDetailsProps) {
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
  const sr = approval.request.separation_request;
  if (!sr) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
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

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ayrılan Personel</p>
          <p className="text-sm font-semibold">{sr.employee_name || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Unvanı</p>
          <p className="text-sm font-semibold">{sr.employee_title || "-"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Departmanı</p>
          <p className="text-sm font-semibold">{sr.department || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Lokasyonu</p>
          <p className="text-sm font-semibold">{sr.location || "-"}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">İş Tanımı/Kapsamı/Kodu</p>
        <p className="text-sm font-semibold">{sr.job_description || "-"}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Bağlı Olduğu Yönetici</p>
          <p className="text-sm font-semibold">{sr.reporting_manager || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ayrılış Tarihi</p>
          <p className="text-sm font-semibold">
            {sr.separation_date
              ? format(new Date(sr.separation_date as string), "d MMMM yyyy", { locale: tr })
              : "-"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ayrılış Sebebi</p>
          <p className="text-sm font-semibold">{sr.separation_reason || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Çalışma Süresi</p>
          <p className="text-sm font-semibold">{sr.employment_period || "-"}</p>
        </div>
      </div>

      {/* Mali Tablo */}
      {(sr.annual_leave_days != null || sr.severance_days != null || sr.notice_weeks != null) && (
        <div className="border-t pt-3 mt-1">
          <p className="text-sm font-semibold mb-2">Mali Tablo</p>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="py-2 text-xs">Kalem</TableHead>
                  <TableHead className="py-2 text-xs text-right">Gün/Hafta</TableHead>
                  <TableHead className="py-2 text-xs text-right">Tutar (₺)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="py-2 text-sm">Yıllık İzin</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.annual_leave_days ?? "-"} gün</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.annual_leave_amount?.toLocaleString("tr-TR") ?? "-"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-2 text-sm">Kıdem Tazminatı</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.severance_days ?? "-"} gün</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.severance_amount?.toLocaleString("tr-TR") ?? "-"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-2 text-sm">İhbar Tazminatı</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.notice_weeks ?? "-"} hafta</TableCell>
                  <TableCell className="py-2 text-sm text-right">{sr.notice_amount?.toLocaleString("tr-TR") ?? "-"}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Daha önce doldurulmuş section'ları göster (read-only) */}
      {Object.entries(separationSectionConfig).map(([sectionKey, config]) => {
        const sectionNum = parseInt(sectionKey.replace('section_', ''));
        const currentNum = parseInt(separationSectionKey.replace('section_', '') || '0');
        // Sadece mevcut adımdan önce gelen section'ları göster
        if (sectionNum >= currentNum && currentNum > 0) return null;

        return (
          <div key={sectionKey} className="border-t pt-3 mt-1">
            <p className="text-sm font-semibold mb-2">{config.title}</p>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="py-2 text-xs">İş</TableHead>
                    <TableHead className="py-2 text-xs w-[100px]">Durum</TableHead>
                    <TableHead className="py-2 text-xs">Açıklama</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.items.map((item) => {
                    const status = sr[`${item.key}_status`] as string;
                    const notes = sr[`${item.key}_notes`] as string;
                    return (
                      <TableRow key={item.key}>
                        <TableCell className="py-2 text-sm">{item.label}</TableCell>
                        <TableCell className="py-2">
                          <Badge className={
                            status === 'DONE' ? 'bg-green-500' :
                            status === 'NA' ? 'bg-gray-400' : 'bg-yellow-500'
                          }>
                            {checklistStatusLabels[status as ChecklistStatus] || status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-sm text-muted-foreground">
                          {notes || <span className="text-xs text-muted-foreground/50">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Önceki adımda yüklenen ek dosyalar */}
            {previousStepAttachments.filter((a) => a.section_key === sectionKey).length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Ek Dosyalar</p>
                <div className="space-y-1.5">
                  {previousStepAttachments
                    .filter((a) => a.section_key === sectionKey)
                    .map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.config_label}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {attachment.file_name} · {formatFileSize(attachment.file_size)}
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
                            onClick={() => handleDownload(attachment.id, attachment.file_name)}
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
    </>
  );
}

