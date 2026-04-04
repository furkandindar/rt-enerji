"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import type { PendingApproval } from "@/lib/approvals/types";

const positionLabels: Record<string, string> = {
  "top-left": "Sol Üst",
  "top-right": "Sağ Üst",
  center: "Orta",
  "bottom-left": "Sol Alt",
  "bottom-right": "Sağ Alt",
};

interface StampRequestDetailsProps {
  approval: PendingApproval;
}

export function StampRequestDetails({ approval }: StampRequestDetailsProps) {
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const stamp = approval.request.stamp_request;
  if (!stamp) return null;

  return (
    <>
      {stamp.subject && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Konu</p>
          <p className="text-sm font-semibold">{stamp.subject}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Kaşe</p>
          <p className="text-sm font-semibold">{stamp.stamp?.name || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Kaşe Konumu</p>
          <p className="text-sm font-semibold">
            {positionLabels[stamp.stamp_position] || stamp.stamp_position}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Kaşelenecek Sayfalar</p>
          <p className="text-sm font-semibold">
            {stamp.selected_pages === "all" ? "Tüm sayfalar" : `Sayfa: ${stamp.selected_pages}`}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Durum</p>
          <p className="text-sm font-semibold">
            {stamp.stamped_pdf_path ? "Kaşelenmiş ✓" : "Kaşelenmedi"}
          </p>
        </div>
      </div>
      {stamp.description && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Açıklama</p>
          <p className="text-sm font-semibold whitespace-pre-wrap">{stamp.description}</p>
        </div>
      )}

      {/* Orijinal PDF Önizleme */}
      <div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowPdfPreview(true)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Orijinal PDF&apos;i Görüntüle
        </Button>
      </div>

      {showPdfPreview && (
        <PdfViewerDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          previewUrl={`/api/stamp-approval/${approval.request.id}/original-pdf`}
          downloadUrl={`/api/stamp-approval/${approval.request.id}/original-pdf`}
          fileName="orijinal_belge.pdf"
        />
      )}
    </>
  );
}

