"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileIcon, Download } from "lucide-react";
import { overtimeTypeLabels, overtimeReasonLabels } from "@/lib/approvals/constants";
import type { PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";

interface OvertimeRequestDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

export function OvertimeRequestDetails({ approval, previousStepAttachments = [] }: OvertimeRequestDetailsProps) {
  const ot = approval.request.overtime_request;
  if (!ot) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Fazla Mesai Tipi</p>
          <p className="text-sm font-semibold">
            {overtimeTypeLabels[ot.overtime_type]}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Dönem</p>
          <p className="text-sm font-semibold">
            {ot.month} {ot.year}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Neden Kategorisi</p>
          <p className="text-sm font-semibold">
            {overtimeReasonLabels[ot.reason_category]}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Talep Eden Kişi/Durum</p>
        <p className="text-sm font-semibold">{ot.reason_detail}</p>
      </div>

      {/* EMERGENCY specific fields */}
      {ot.overtime_type === 'EMERGENCY' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Çalışma Yeri</p>
              <p className="text-sm font-semibold">{ot.work_location || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Çalışma Nedeni</p>
              <p className="text-sm font-semibold">{ot.work_reason || "-"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Çalışma Başlangıç</p>
              <p className="text-sm font-semibold">
                {ot.work_start_date
                  ? format(new Date(ot.work_start_date), "d MMM yyyy HH:mm", { locale: tr })
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Çalışma Bitiş</p>
              <p className="text-sm font-semibold">
                {ot.work_end_date
                  ? format(new Date(ot.work_end_date), "d MMM yyyy HH:mm", { locale: tr })
                  : "-"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Önceki Mesai Saati</p>
              <p className="text-sm font-semibold">{ot.previous_shift || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sonraki Mesai Saati</p>
              <p className="text-sm font-semibold">{ot.next_shift || "-"}</p>
            </div>
          </div>
        </>
      )}

      {/* STAFF_SHORTAGE specific fields */}
      {ot.overtime_type === 'STAFF_SHORTAGE' && ot.entries && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Çalışan Listesi</p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Soyad</TableHead>
                  <TableHead>Rol/Unvan</TableHead>
                  <TableHead>FM Saati</TableHead>
                  <TableHead>Ücret (TL)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ot.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.full_name}</TableCell>
                    <TableCell>{entry.role_title}</TableCell>
                    <TableCell>{entry.overtime_hours} saat</TableCell>
                    <TableCell>{entry.overtime_pay.toLocaleString('tr-TR')} TL</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Toplam Saat</p>
              <p className="text-sm font-semibold">{ot.total_hours || 0} saat</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Toplam Ücret</p>
              <p className="text-sm font-semibold">{(ot.total_pay || 0).toLocaleString('tr-TR')} TL</p>
            </div>
          </div>
        </div>
      )}

      {ot.hr_note && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">İK Notu</p>
          <p className="text-sm font-semibold">{ot.hr_note}</p>
        </div>
      )}

      {/* Önceki adımda yüklenen ek dosyalar */}
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
                  <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{attachment.config_label || attachment.file_name}</span>
                </div>
                <a
                  href={`/api/attachments/${attachment.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

