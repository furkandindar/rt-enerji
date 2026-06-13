"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowStepAttachmentConfig, RequestAttachment, PreviousStepAttachment } from "@/lib/workflow/types";
import type { PendingApproval, ChecklistStatus, ChecklistItem, SignatureInfo } from "@/lib/approvals/types";
import { ApprovalStatusBadge } from "./status-badge";
import { getRequesterFullName, getRequesterPosition } from "./utils";
import { LeaveRequestDetails } from "./leave-request-details";
import { SalaryAdvanceDetails } from "./salary-advance-details";
import { OvertimeRequestDetails } from "./overtime-request-details";
import { OnboardingRequestDetails } from "./onboarding-request-details";
import { SeparationRequestDetails } from "./separation-request-details";
import { RequestFormDetails } from "./request-form-details";
import { StampRequestDetails } from "./stamp-request-details";
import { TravelAssignmentDetails } from "./travel-assignment-details";
import { ApprovalLetterDetails } from "./approval-letter-details";
import { FinanceApprovalCoverDetails } from "./finance-approval-cover-details";
import { AccountingApprovalCoverDetails } from "./accounting-approval-cover-details";
import { ComparisonFormDetails } from "./comparison-form-details";
import { ExpenseFormDetails } from "./expense-form-details";
import { ApprovalHistoryAccordion } from "./approval-history-accordion";
import { RequestActivityLog } from "./request-activity-log";
import { ApprovalActions } from "./approval-actions";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { openPdfPreview } from "@/lib/pdf/open-preview";

export interface ApprovalDetailViewProps {
  selectedApproval: PendingApproval;

  // Actions props
  isHrForm: boolean;
  remainingDays: string;
  setRemainingDays: (value: string) => void;
  hrNote: string;
  setHrNote: (value: string) => void;
  isSalaryConsentForm: boolean;
  salaryDeductionConsent: boolean;
  setSalaryDeductionConsent: (value: boolean) => void;
  isOnboardingSectionForm: boolean;
  currentSectionConfig: { title: string; items: ChecklistItem[] } | null;
  onboardingSectionKey: string;
  onboardingChecklist: Record<string, { status: ChecklistStatus; notes: string }>;
  setOnboardingChecklist: React.Dispatch<React.SetStateAction<Record<string, { status: ChecklistStatus; notes: string }>>>;
  isSeparationSectionForm: boolean;
  currentSeparationSectionConfig: { title: string; items: ChecklistItem[] } | null;
  separationSectionKey: string;
  separationChecklist: Record<string, { status: ChecklistStatus; notes: string }>;
  setSeparationChecklist: React.Dispatch<React.SetStateAction<Record<string, { status: ChecklistStatus; notes: string }>>>;
  attachmentConfigs: WorkflowStepAttachmentConfig[];
  uploadedAttachments: RequestAttachment[];
  setUploadedAttachments: React.Dispatch<React.SetStateAction<RequestAttachment[]>>;
  previousStepAttachments: PreviousStepAttachment[];
  comment: string;
  setComment: (value: string) => void;
  signatureInfo: SignatureInfo;
  signatureAccepted: boolean;
  setSignatureAccepted: (value: boolean) => void;
  isStampApproval: boolean;
  signatureDataUrl: string | null;
  setSignatureDataUrl: (dataUrl: string | null) => void;
  isTravelCompletionForm: boolean;
  actualDeparture: string;
  setActualDeparture: (value: string) => void;
  actualReturn: string;
  setActualReturn: (value: string) => void;
  isYkbSignedPdfForm: boolean;
  ykbSignedPdfPath: string | null;
  setYkbSignedPdfPath: (value: string | null) => void;
  ykbSignedPdfFileName: string | null;
  setYkbSignedPdfFileName: (value: string | null) => void;
  canApprove: boolean;
  isSubmitting: boolean;
  handleDecision: (decision: "APPROVED" | "REJECTED") => void;
  handleRequestRevision: () => void;
  handleDownloadPDF: (requestId: string) => void;
}

export function ApprovalDetailView({
  selectedApproval,
  isHrForm,
  remainingDays,
  setRemainingDays,
  hrNote,
  setHrNote,
  isSalaryConsentForm,
  salaryDeductionConsent,
  setSalaryDeductionConsent,
  isOnboardingSectionForm,
  currentSectionConfig,
  onboardingSectionKey,
  onboardingChecklist,
  setOnboardingChecklist,
  isSeparationSectionForm,
  currentSeparationSectionConfig,
  separationSectionKey,
  separationChecklist,
  setSeparationChecklist,
  attachmentConfigs,
  uploadedAttachments,
  setUploadedAttachments,
  previousStepAttachments,
  comment,
  setComment,
  signatureInfo,
  signatureAccepted,
  setSignatureAccepted,
  isStampApproval,
  signatureDataUrl,
  setSignatureDataUrl,
  isTravelCompletionForm,
  actualDeparture,
  setActualDeparture,
  actualReturn,
  setActualReturn,
  isYkbSignedPdfForm,
  ykbSignedPdfPath,
  setYkbSignedPdfPath,
  ykbSignedPdfFileName,
  setYkbSignedPdfFileName,
  canApprove,
  isSubmitting,
  handleDecision,
  handleRequestRevision,
  handleDownloadPDF,
}: ApprovalDetailViewProps) {
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  // Aksiyon butonlarının görünürlük koşulları (header sağ tarafa taşındı).
  const requestStatus = selectedApproval.request.status;
  const pdfButtonsVisible =
    ["APPROVED", "AWAITING_COMPLETION", "COMPLETED"].includes(requestStatus) ||
    (requestStatus === "REJECTED" && !!selectedApproval.request.pdf_path);
  const livePreviewVisible =
    !isStampApproval && ["PENDING", "AWAITING_COMPLETION"].includes(requestStatus);

  const isDecided = selectedApproval.status !== "PENDING";

  // Kaşeli onayda imza kanvasının arkasına gerçek kaşeyi koymak için (WYSIWYG):
  // kaşe görsel URL'i ve en/boy oranı.
  const stampForSign = selectedApproval.request.stamp_request?.stamp;
  const stampSignImageUrl = stampForSign ? `/api/stamps/${stampForSign.id}/image` : undefined;
  const stampSignAspectRatio =
    stampForSign && stampForSign.height > 0 ? stampForSign.width / stampForSign.height : undefined;

  return (
    <>
      {/* Header — sol: başlık, sağ: aksiyon butonları (Anlık Önizleme + PDF) */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Talep Detayları</h2>
          <p className="text-sm text-muted-foreground">
            {selectedApproval.request.workflow_definition?.name || "Talep"} detaylarını görüntülüyorsunuz
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {livePreviewVisible && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openPdfPreview(
                  `/api/requests/${selectedApproval.request.id}/pdf/preview-live`,
                  () => setShowLivePreview(true),
                )
              }
            >
              <Eye className="mr-2 h-4 w-4" />
              Anlık Önizleme
            </Button>
          )}
          {pdfButtonsVisible && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openPdfPreview(
                    `/api/requests/${selectedApproval.request.id}/pdf/preview`,
                    () => setShowPdfPreview(true),
                  )
                }
              >
                <Eye className="mr-2 h-4 w-4" />
                PDF Görüntüle
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownloadPDF(selectedApproval.request.id)}
              >
                <Download className="mr-2 h-4 w-4" />
                PDF İndir
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4">
        {/* Kompakt ortak alanlar — 4 sütunlu responsive grid.
            Status !== PENDING ise "Kararınız" + "Karar Tarihi" hücreleri eklenir. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Talep No</p>
            <p className="text-sm font-mono font-semibold">
              {selectedApproval.request.request_no || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Talep Sahibi</p>
            <p className="text-sm font-semibold">
              {getRequesterFullName(selectedApproval.request.requester)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Ünvan</p>
            <p className="text-sm font-semibold">
              {getRequesterPosition(selectedApproval.request.requester)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Talep Tipi</p>
            <p className="text-sm font-semibold">
              {selectedApproval.request.workflow_definition?.name || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Onay Adımı</p>
            <p className="text-sm font-semibold">
              {selectedApproval.request.current_step}/{selectedApproval.request.approvals?.length || 0}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Oluşturulma</p>
            <p className="text-sm font-semibold">
              {format(new Date(selectedApproval.request.created_at), "d MMMM yyyy HH:mm", { locale: tr })}
            </p>
          </div>
          {isDecided && (
            <>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Kararınız</p>
                <ApprovalStatusBadge status={selectedApproval.status} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Karar Tarihi</p>
                <p className="text-sm font-semibold">
                  {selectedApproval.decided_at
                    ? format(new Date(selectedApproval.decided_at), "d MMMM yyyy HH:mm", { locale: tr })
                    : "-"}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Request Type Details */}
        {selectedApproval.request.leave_request && (
          <LeaveRequestDetails approval={selectedApproval} />
        )}
        {selectedApproval.request.salary_advance_request && (
          <SalaryAdvanceDetails approval={selectedApproval} />
        )}
        {selectedApproval.request.overtime_request && (
          <OvertimeRequestDetails
            approval={selectedApproval}
            previousStepAttachments={previousStepAttachments}
          />
        )}
        {selectedApproval.request.onboarding_request && (
          <OnboardingRequestDetails
            approval={selectedApproval}
            onboardingSectionKey={onboardingSectionKey}
            previousStepAttachments={previousStepAttachments}
          />
        )}
        {selectedApproval.request.separation_request && (
          <SeparationRequestDetails
            approval={selectedApproval}
            separationSectionKey={separationSectionKey}
            previousStepAttachments={previousStepAttachments}
          />
        )}
        {selectedApproval.request.request_form_request && (
          <RequestFormDetails
            approval={selectedApproval}
            previousStepAttachments={previousStepAttachments}
          />
        )}
        {selectedApproval.request.stamp_request && (
          <StampRequestDetails approval={selectedApproval} />
        )}
        {selectedApproval.request.travel_assignment_request && (
          <TravelAssignmentDetails approval={selectedApproval} />
        )}
        {selectedApproval.request.approval_letter_request && (
          <ApprovalLetterDetails approval={selectedApproval} previousStepAttachments={previousStepAttachments} />
        )}
        {selectedApproval.request.finance_approval_cover_request && (
          <FinanceApprovalCoverDetails approval={selectedApproval} previousStepAttachments={previousStepAttachments} />
        )}
        {selectedApproval.request.accounting_approval_cover_request && (
          <AccountingApprovalCoverDetails approval={selectedApproval} previousStepAttachments={previousStepAttachments} />
        )}
        {selectedApproval.request.mukayese_request && (
          <ComparisonFormDetails
            mukayese={selectedApproval.request.mukayese_request}
            approvals={selectedApproval.request.approvals}
            previousStepAttachments={previousStepAttachments}
          />
        )}
        {selectedApproval.request.expense_request && (
          <ExpenseFormDetails approval={selectedApproval} previousStepAttachments={previousStepAttachments} />
        )}

        {/* Onay Adımı, Oluşturulma, Karar bilgileri kompakt grid'e taşındı. */}

        {/* Süreç Logu — tüm cycle'lar + lifecycle olayları */}
        <RequestActivityLog request={selectedApproval.request} />

        {/* Onay Geçmişi (default açık, aktif cycle adımları) */}
        {selectedApproval.request.approvals && selectedApproval.request.approvals.length > 0 && (
          <ApprovalHistoryAccordion approvals={selectedApproval.request.approvals} />
        )}

        {/* Onay İşlemleri - Sadece bekleyen onaylar için */}
        {selectedApproval.status === "PENDING" && (
          <ApprovalActions
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
            onboardingChecklist={onboardingChecklist}
            setOnboardingChecklist={setOnboardingChecklist}
            isSeparationSectionForm={isSeparationSectionForm}
            currentSeparationSectionConfig={currentSeparationSectionConfig}
            separationChecklist={separationChecklist}
            setSeparationChecklist={setSeparationChecklist}
            requestId={selectedApproval.request.id}
            attachmentConfigs={attachmentConfigs}
            uploadedAttachments={uploadedAttachments}
            setUploadedAttachments={setUploadedAttachments}
            comment={comment}
            setComment={setComment}
            signatureInfo={signatureInfo}
            signatureAccepted={signatureAccepted}
            setSignatureAccepted={setSignatureAccepted}
            isStampApproval={isStampApproval}
            signatureDataUrl={signatureDataUrl}
            setSignatureDataUrl={setSignatureDataUrl}
            stampImageUrl={stampSignImageUrl}
            stampAspectRatio={stampSignAspectRatio}
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
          />
        )}

        {/* PDF & Anlık Önizleme butonları + karar bilgileri artık header ve kompakt grid'de. */}
      </div>

      {showPdfPreview && (
        <PdfViewerDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          previewUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview`}
          downloadUrl={`/api/requests/${selectedApproval.request.id}/pdf`}
          fileName={`talep_${selectedApproval.request.id}.pdf`}
        />
      )}

      {showLivePreview && (
        <PdfViewerDialog
          open={showLivePreview}
          onOpenChange={setShowLivePreview}
          previewUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview-live`}
          downloadUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview-live`}
          fileName={`talep_${selectedApproval.request.id}_onizleme.pdf`}
        />
      )}
    </>
  );
}
