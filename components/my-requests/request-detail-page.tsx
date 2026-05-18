"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import {
  RequestDetailContent,
  type Request as RequestType,
  type Attachment,
} from "@/components/my-requests/request-detail-content";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { parseContentDispositionFilename } from "@/lib/pdf/file-naming";

export type RequestDetailPageProps = {
  backLabel: string;
  backFallbackUrl: string;
};

export function RequestDetailPage(props: RequestDetailPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <RequestDetailPageInner {...props} />
    </Suspense>
  );
}

function RequestDetailPageInner({ backLabel, backFallbackUrl }: RequestDetailPageProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestId = params.id;

  const [request, setRequest] = useState<RequestType | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  const loadRequest = async () => {
    try {
      const res = await fetch(`/api/my-requests/${requestId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Talep bulunamadı veya erişim yetkin yok");
        } else if (res.status === 504) {
          toast.error("Sorgu zaman aşımına uğradı, lütfen tekrar deneyin");
        } else {
          toast.error("Talep yüklenemedi");
        }
        setRequest(null);
        return;
      }
      const data = await res.json();
      setRequest(data);
    } catch (err) {
      console.error(err);
      toast.error("Bir hata oluştu");
    }
  };

  const loadAttachments = async () => {
    try {
      const res = await fetch(`/api/attachments?request_id=${requestId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.attachments)) setAttachments(data.attachments);
      }
    } catch (err) {
      console.error("Error fetching attachments:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      await loadRequest();
      if (cancelled) return;
      await loadAttachments();
      if (cancelled) return;
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // Lifecycle actions (cancel, resubmit, withdraw vb.) sonrası refresh.
  const refresh = () => {
    loadRequest();
  };

  const handleDownloadPDF = async (id: string) => {
    try {
      toast.loading("PDF indiriliyor...");
      const response = await fetch(`/api/requests/${id}/pdf`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "PDF indirilemedi");
      }
      const fileName =
        parseContentDispositionFilename(response.headers.get("Content-Disposition")) ||
        `talep_${id}.pdf`;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.dismiss();
      toast.success("PDF indirildi");
    } catch (err) {
      toast.dismiss();
      toast.error(err instanceof Error ? err.message : "PDF indirilemedi");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">
          Talep bulunamadı veya erişim yetkin yok.
        </p>
        <Button variant="outline" onClick={() => router.push(backFallbackUrl)}>
          Geri dön
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(backFallbackUrl);
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Button>
        <span className="text-sm text-muted-foreground">
          / {request.request_no || request.id}
        </span>
      </div>

      <RequestDetailContent
        request={request}
        attachments={attachments}
        onChange={refresh}
        onDownloadPDF={handleDownloadPDF}
        onShowPdfPreview={() => setShowPdfPreview(true)}
        onShowLivePreview={() => setShowLivePreview(true)}
      />

      {showPdfPreview && (
        <PdfViewerDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          previewUrl={`/api/requests/${request.id}/pdf/preview`}
          downloadUrl={`/api/requests/${request.id}/pdf`}
          fileName={`talep_${request.id}.pdf`}
        />
      )}

      {showLivePreview && (
        <PdfViewerDialog
          open={showLivePreview}
          onOpenChange={setShowLivePreview}
          previewUrl={`/api/requests/${request.id}/pdf/preview-live`}
          downloadUrl={`/api/requests/${request.id}/pdf/preview-live`}
          fileName={`talep_${request.id}_onizleme.pdf`}
        />
      )}
    </div>
  );
}
