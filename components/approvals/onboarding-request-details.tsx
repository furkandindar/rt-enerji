"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { FileText, Download } from "lucide-react";
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
import { onboardingSectionConfig, checklistStatusLabels } from "@/lib/approvals/constants";

interface OnboardingRequestDetailsProps {
  approval: PendingApproval;
  onboardingSectionKey: string;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function OnboardingRequestDetails({ approval, onboardingSectionKey, previousStepAttachments = [] }: OnboardingRequestDetailsProps) {
  const ob = approval.request.onboarding_request;
  if (!ob) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/attachments/${fileId}/download`);
      if (!response.ok) throw new Error("İndirme linki alınamadı");
      const { url } = await response.json();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error("Dosya indirilemedi");
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">İşe Başlayacak Kişi</p>
          <p className="text-sm font-semibold">{ob.employee_name || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Unvanı</p>
          <p className="text-sm font-semibold">{ob.employee_title || "-"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Departmanı</p>
          <p className="text-sm font-semibold">{ob.department || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Lokasyonu</p>
          <p className="text-sm font-semibold">{ob.location || "-"}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">İş Tanımı/Kapsamı/Kodu</p>
        <p className="text-sm font-semibold">{ob.job_description || "-"}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Bağlı Olduğu Yönetici</p>
          <p className="text-sm font-semibold">{ob.reporting_manager || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">İşe Giriş Tarihi</p>
          <p className="text-sm font-semibold">
            {ob.start_date
              ? format(new Date(ob.start_date), "d MMMM yyyy", { locale: tr })
              : "-"}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Zaman Aralığı</p>
        <p className="text-sm font-semibold">{ob.employment_period || "-"}</p>
      </div>

      {/* Daha önce doldurulmuş section'ları göster (read-only) */}
      {Object.entries(onboardingSectionConfig).map(([sectionKey, config]) => {
        const sectionNum = parseInt(sectionKey.replace('section_', ''));
        const currentNum = parseInt(onboardingSectionKey.replace('section_', '') || '0');
        if (sectionNum >= currentNum && currentNum > 0) return null;
        const firstItem = config.items[0];
        const firstStatus = ob[`${firstItem.key}_status`];
        if (!firstStatus || firstStatus === 'NOT_DONE') return null;

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
                    const status = ob[`${item.key}_status`] as string;
                    const notes = ob[`${item.key}_notes`] as string;
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 ml-2"
                          onClick={() => handleDownload(attachment.id, attachment.file_name)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

