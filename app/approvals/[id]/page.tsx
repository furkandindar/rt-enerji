"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { ApprovalDetailView } from "@/components/approvals/approval-detail-view";
import { useApprovals } from "@/lib/approvals/use-approvals";
import type { PendingApproval } from "@/lib/approvals/types";

// Next.js 16: useParams gibi dinamik route hook'larını kullanan client component'ler
// kendi Suspense boundary'sinde olmalı — yoksa "Uncached data outside Suspense" uyarısı.
export default function ApprovalDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ApprovalDetailPageInner />
    </Suspense>
  );
}

function ApprovalDetailPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const approvalId = params.id;

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // useApprovals tüm sayfa için tasarlanmış (list + form state'leri + handler'lar).
  // Detail sayfasında list gereksiz — mode='none' (default) ile pending/history
  // fetch'lerini atlıyoruz, sadece form state'leri ve handler'lardan faydalanıyoruz.
  const approvals = useApprovals();

  // Mount'ta /api/approvals/[id]'den çek, hook'a selectedApproval olarak set et
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPageLoading(true);
        setPageError(null);
        const res = await fetch(`/api/approvals/${approvalId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setPageError("Onay kaydı bulunamadı veya erişim yetkin yok.");
          } else if (res.status === 504) {
            setPageError("Sorgu zaman aşımına uğradı, lütfen tekrar deneyin.");
          } else {
            setPageError("Onay yüklenemedi.");
          }
          return;
        }
        const data: PendingApproval = await res.json();
        if (cancelled) return;
        approvals.setSelectedApproval(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPageError("Bir hata oluştu.");
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalId]);

  // Karar verildikten sonra hook setSelectedApproval(null) çağırıyor — bunu yakalayıp
  // /approvals listesine yönlendir.
  useEffect(() => {
    if (!pageLoading && !pageError && approvals.selectedApproval === null) {
      // karar verildi
      toast.success("İşlem tamamlandı");
      router.push("/approvals");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals.selectedApproval]);

  if (pageLoading || approvals.isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pageError || !approvals.selectedApproval) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">
          {pageError ?? "Onay kaydı bulunamadı."}
        </p>
        <Button variant="outline" onClick={() => router.push("/approvals")}>
          Bekleyen Onaylar&apos;a dön
        </Button>
      </div>
    );
  }

  const selected = approvals.selectedApproval;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/approvals");
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Bekleyen Onaylar
        </Button>
        <span className="text-sm text-muted-foreground">
          / {selected.request.request_no || selected.id}
        </span>
      </div>

      <ApprovalDetailView
        selectedApproval={selected}
        isHrForm={approvals.isHrForm}
        remainingDays={approvals.remainingDays}
        setRemainingDays={approvals.setRemainingDays}
        hrNote={approvals.hrNote}
        setHrNote={approvals.setHrNote}
        isSalaryConsentForm={approvals.isSalaryConsentForm}
        salaryDeductionConsent={approvals.salaryDeductionConsent}
        setSalaryDeductionConsent={approvals.setSalaryDeductionConsent}
        isOnboardingSectionForm={approvals.isOnboardingSectionForm}
        currentSectionConfig={approvals.currentSectionConfig}
        onboardingSectionKey={approvals.onboardingSectionKey}
        onboardingChecklist={approvals.onboardingChecklist}
        setOnboardingChecklist={approvals.setOnboardingChecklist}
        isSeparationSectionForm={approvals.isSeparationSectionForm}
        currentSeparationSectionConfig={approvals.currentSeparationSectionConfig}
        separationSectionKey={approvals.separationSectionKey}
        separationChecklist={approvals.separationChecklist}
        setSeparationChecklist={approvals.setSeparationChecklist}
        attachmentConfigs={approvals.attachmentConfigs}
        uploadedAttachments={approvals.uploadedAttachments}
        setUploadedAttachments={approvals.setUploadedAttachments}
        previousStepAttachments={approvals.previousStepAttachments}
        comment={approvals.comment}
        setComment={approvals.setComment}
        signatureInfo={approvals.signatureInfo}
        signatureAccepted={approvals.signatureAccepted}
        setSignatureAccepted={approvals.setSignatureAccepted}
        isStampApproval={approvals.isStampApproval}
        signatureDataUrl={approvals.signatureDataUrl}
        setSignatureDataUrl={approvals.setSignatureDataUrl}
        isTravelCompletionForm={approvals.isTravelCompletionForm}
        actualDeparture={approvals.actualDeparture}
        setActualDeparture={approvals.setActualDeparture}
        actualReturn={approvals.actualReturn}
        setActualReturn={approvals.setActualReturn}
        isYkbSignedPdfForm={approvals.isYkbSignedPdfForm}
        ykbSignedPdfPath={approvals.ykbSignedPdfPath}
        setYkbSignedPdfPath={approvals.setYkbSignedPdfPath}
        ykbSignedPdfFileName={approvals.ykbSignedPdfFileName}
        setYkbSignedPdfFileName={approvals.setYkbSignedPdfFileName}
        canApprove={approvals.canApprove}
        isSubmitting={approvals.isSubmitting}
        handleDecision={approvals.handleDecision}
        handleRequestRevision={approvals.handleRequestRevision}
        handleDownloadPDF={approvals.handleDownloadPDF}
      />
    </div>
  );
}
