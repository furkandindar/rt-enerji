"use client";

import { Loader2 } from "lucide-react";
import { useApprovals } from "@/lib/approvals/use-approvals";
import { PendingApprovalsTable } from "@/components/approvals/pending-approvals-table";
import { ApprovalHistoryTable } from "@/components/approvals/approval-history-table";
import { ApprovalDetailSheet } from "@/components/approvals/approval-detail-sheet";

export default function ApprovalsPage() {
  const {
    pendingApprovals,
    approvalHistory,
    paginatedHistory,
    selectedApproval,
    isLoading,
    isSubmitting,
    comment,
    signatureInfo,
    signatureAccepted,
    signatureDataUrl,
    remainingDays,
    hrNote,
    salaryDeductionConsent,
    onboardingChecklist,
    separationChecklist,
    attachmentConfigs,
    uploadedAttachments,
    previousStepAttachments,
    isHrForm,
    isSalaryConsentForm,
    isOnboardingSectionForm,
    currentSectionConfig,
    onboardingSectionKey,
    isSeparationSectionForm,
    currentSeparationSectionConfig,
    separationSectionKey,
    isStampApproval,
    isTravelCompletionForm,
    isYkbSignedPdfForm,
    ykbSignedPdfPath,
    setYkbSignedPdfPath,
    ykbSignedPdfFileName,
    setYkbSignedPdfFileName,
    canApprove,
    currentPage,
    pageSize,
    totalPages,
    setSelectedApproval,
    setComment,
    setSignatureAccepted,
    setSignatureDataUrl,
    setRemainingDays,
    setHrNote,
    setSalaryDeductionConsent,
    setOnboardingChecklist,
    setSeparationChecklist,
    actualDeparture,
    setActualDeparture,
    actualReturn,
    setActualReturn,
    setUploadedAttachments,
    handleDecision,
    handleRequestRevision,
    handleDownloadPDF,
    handlePageChange,
    handlePageSizeChange,
  } = useApprovals();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onaylar</h1>
        <p className="text-muted-foreground">
          Bekleyen onaylarınızı ve onay geçmişinizi görüntüleyin
        </p>
      </div>

      {/* Bekleyen Onaylar */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Bekleyen Onaylar</h2>
          <p className="text-sm text-muted-foreground">
            İşlem yapmanız gereken talepler
          </p>
        </div>
        <PendingApprovalsTable
          approvals={pendingApprovals}
          onSelect={setSelectedApproval}
        />
      </div>

      {/* Onay Geçmişi */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Onay Geçmişi</h2>
          <p className="text-sm text-muted-foreground">
            Daha önce işlem yaptığınız talepler
          </p>
        </div>
        <ApprovalHistoryTable
          history={approvalHistory}
          paginatedHistory={paginatedHistory}
          onSelect={setSelectedApproval}
          currentPage={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Detay Sheet */}
      <ApprovalDetailSheet
        selectedApproval={selectedApproval}
        onClose={() => setSelectedApproval(null)}
        isHrForm={isHrForm}
        remainingDays={remainingDays}
        setRemainingDays={setRemainingDays}
        hrNote={hrNote}
        setHrNote={setHrNote}
        isSalaryConsentForm={isSalaryConsentForm}
        salaryDeductionConsent={salaryDeductionConsent}
        setSalaryDeductionConsent={setSalaryDeductionConsent}
        isOnboardingSectionForm={isOnboardingSectionForm}
        currentSectionConfig={currentSectionConfig}
        onboardingSectionKey={onboardingSectionKey}
        onboardingChecklist={onboardingChecklist}
        setOnboardingChecklist={setOnboardingChecklist}
        isSeparationSectionForm={isSeparationSectionForm}
        currentSeparationSectionConfig={currentSeparationSectionConfig}
        separationSectionKey={separationSectionKey}
        separationChecklist={separationChecklist}
        setSeparationChecklist={setSeparationChecklist}
        attachmentConfigs={attachmentConfigs}
        uploadedAttachments={uploadedAttachments}
        setUploadedAttachments={setUploadedAttachments}
        previousStepAttachments={previousStepAttachments}
        comment={comment}
        setComment={setComment}
        signatureInfo={signatureInfo}
        signatureAccepted={signatureAccepted}
        setSignatureAccepted={setSignatureAccepted}
        isStampApproval={isStampApproval}
        signatureDataUrl={signatureDataUrl}
        setSignatureDataUrl={setSignatureDataUrl}
        isTravelCompletionForm={isTravelCompletionForm}
        actualDeparture={actualDeparture}
        setActualDeparture={setActualDeparture}
        actualReturn={actualReturn}
        setActualReturn={setActualReturn}
        isYkbSignedPdfForm={isYkbSignedPdfForm}
        ykbSignedPdfPath={ykbSignedPdfPath}
        setYkbSignedPdfPath={setYkbSignedPdfPath}
        ykbSignedPdfFileName={ykbSignedPdfFileName}
        setYkbSignedPdfFileName={setYkbSignedPdfFileName}
        canApprove={canApprove}
        isSubmitting={isSubmitting}
        handleDecision={handleDecision}
        handleRequestRevision={handleRequestRevision}
        handleDownloadPDF={handleDownloadPDF}
      />
    </div>
  );
}

