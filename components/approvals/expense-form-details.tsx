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

interface ExpenseFormDetailsProps {
  approval: PendingApproval;
  previousStepAttachments?: PreviousStepAttachment[];
}

const formatAmount = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export function ExpenseFormDetails({
  approval,
  previousStepAttachments = [],
}: ExpenseFormDetailsProps) {
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);
  const expense = approval.request.expense_request;
  if (!expense) return null;

  const items = [...(expense.items || [])].sort((a, b) => a.row_order - b.row_order);
  const totalExpenses = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const advance = expense.advance_amount ?? 0;
  const balance = advance - totalExpenses;

  return (
    <>
      {/* Genel Bilgiler */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tarih</p>
          <p className="text-sm font-semibold">
            {format(new Date(expense.request_date), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Harcama Tipi</p>
          <p className="text-sm font-semibold">{expense.is_travel ? "Seyahat Harcaması" : "İş Harcaması"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Proje Adı</p>
          <p className="text-sm font-semibold">{expense.project_name}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Proje Kodu</p>
          <p className="text-sm font-semibold">{expense.project_code}</p>
        </div>
        <div className="col-span-2">
          <p className="text-sm font-medium text-muted-foreground">
            {expense.is_travel ? "Seyahat Yapılan Yer" : "İşin Adı"}
          </p>
          <p className="text-sm font-semibold">{expense.work_or_destination}</p>
        </div>
      </div>

      {/* Seyahat Bilgileri */}
      {expense.is_travel && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Seyahat Bilgileri</p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Kişi Sayısı</p>
              <p className="font-medium">{expense.travel_person_count ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Seyahat Tarihi</p>
              <p className="font-medium">
                {expense.travel_date
                  ? format(new Date(expense.travel_date), "d MMM yyyy", { locale: tr })
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Süre</p>
              <p className="font-medium">{expense.travel_duration ?? "-"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Harcama Kalemleri */}
      {items.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Harcama Kalemleri</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Sıra</th>
                  <th className="py-1.5 pr-2 font-medium">Tarih</th>
                  <th className="py-1.5 pr-2 font-medium">Evrak No</th>
                  <th className="py-1.5 pr-2 font-medium">Açıklama</th>
                  <th className="py-1.5 font-medium text-right">Tutar (TL)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-2">{it.row_order}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {format(new Date(it.item_date), "d MMM yyyy", { locale: tr })}
                    </td>
                    <td className="py-1.5 pr-2">{it.document_no || "-"}</td>
                    <td className="py-1.5 pr-2">{it.description}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {formatAmount(it.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={4} className="py-1.5 pr-2 text-right">Toplam</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {formatAmount(totalExpenses)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Avans / Bakiye */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-sm font-semibold">Avans ve Bakiye</p>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Avans Tutarı (a)</p>
            <p className="font-medium">{formatAmount(expense.advance_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Harcamalar Toplamı (b)</p>
            <p className="font-medium">{formatAmount(totalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bakiye (a-b)</p>
            <p className={`font-medium ${balance < 0 ? "text-destructive" : ""}`}>
              {formatAmount(balance)}
            </p>
          </div>
        </div>
      </div>


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
