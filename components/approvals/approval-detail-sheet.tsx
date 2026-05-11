"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { ApprovalActions } from "./approval-actions";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

interface ApprovalDetailSheetProps {
  selectedApproval: PendingApproval | null;
  onClose: () => void;

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

export function ApprovalDetailSheet({
  selectedApproval,
  onClose,
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
}: ApprovalDetailSheetProps) {
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  return (
    <Sheet open={selectedApproval !== null} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <SheetContent className="overflow-y-auto sm:max-w-[750px]">
        <SheetHeader>
          <SheetTitle>Talep Detayları</SheetTitle>
          <SheetDescription>
            {selectedApproval?.request.workflow_definition?.name || "Talep"} detaylarını görüntülüyorsunuz
          </SheetDescription>
        </SheetHeader>
        {selectedApproval && (
          <div className="grid grid-cols-1 gap-4 p-4">
            {/* Talep No */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Talep No</p>
              <p className="text-sm font-mono font-semibold">
                {selectedApproval.request.request_no || "-"}
              </p>
            </div>

            {/* Talep Sahibi Bilgileri */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Talep Tipi</p>
                <p className="text-sm font-semibold">
                  {selectedApproval.request.workflow_definition?.name || "-"}
                </p>
              </div>
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

            {/* Onay Adımı ve Oluşturulma */}
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {/* Onay Geçmişi */}
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

            {/* Karar Bilgisi - Onay geçmişi için */}
            {selectedApproval.status !== "PENDING" && (
              <div className="border-t pt-4 mt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Kararınız:</p>
                  <ApprovalStatusBadge status={selectedApproval.status} />
                </div>
                {selectedApproval.decided_at && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {format(new Date(selectedApproval.decided_at), "d MMMM yyyy HH:mm", { locale: tr })}
                  </p>
                )}

                {/* PDF Butonları - Onaylanmış veya pdf_path mevcut reddedilmiş talepler için */}
                {(["APPROVED", "AWAITING_COMPLETION", "COMPLETED"].includes(
                  selectedApproval.request.status,
                ) ||
                  (selectedApproval.request.status === "REJECTED" &&
                    !!selectedApproval.request.pdf_path)) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowPdfPreview(true)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      PDF Görüntüle
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDownloadPDF(selectedApproval.request.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF İndir
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Anlık Önizleme - Süreç devam ediyorsa (PENDING / AWAITING_COMPLETION) */}
            {/* STAMP_APPROVAL'da gösterilmiyor: bu süreç için live preview yanlış template
                render ediyor; orijinali StampRequestDetails içindeki "Orijinal PDF'i Görüntüle"
                butonu zaten gösteriyor. */}
            {!isStampApproval &&
              ["PENDING", "AWAITING_COMPLETION"].includes(selectedApproval.request.status) && (
                <div className="border-t pt-4 mt-6">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowLivePreview(true)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Anlık Önizleme (Mevcut Hal)
                  </Button>
                </div>
              )}
          </div>
        )}
      </SheetContent>

      {selectedApproval && showPdfPreview && (
        <PdfViewerDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          previewUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview`}
          downloadUrl={`/api/requests/${selectedApproval.request.id}/pdf`}
          fileName={`talep_${selectedApproval.request.id}.pdf`}
        />
      )}

      {selectedApproval && showLivePreview && (
        <PdfViewerDialog
          open={showLivePreview}
          onOpenChange={setShowLivePreview}
          previewUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview-live`}
          downloadUrl={`/api/requests/${selectedApproval.request.id}/pdf/preview-live`}
          fileName={`talep_${selectedApproval.request.id}_onizleme.pdf`}
        />
      )}
    </Sheet>
  );
}
