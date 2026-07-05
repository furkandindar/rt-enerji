"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureCanvasPanel } from "@/components/signature-canvas-panel";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { YkbSignedPdfUpload } from "@/components/approvals/ykb-signed-pdf-upload";
import type { WorkflowStepAttachmentConfig, RequestAttachment } from "@/lib/workflow/types";
import type { ChecklistStatus, ChecklistItem, SignatureInfo } from "@/lib/approvals/types";

interface ApprovalActionsProps {
  // HR form
  isHrForm: boolean;
  remainingDays: string;
  setRemainingDays: (value: string) => void;
  hrNote: string;
  setHrNote: (value: string) => void;

  // Salary consent
  isSalaryConsentForm: boolean;
  salaryDeductionConsent: boolean;
  setSalaryDeductionConsent: (value: boolean) => void;

  // Onboarding checklist
  isOnboardingSectionForm: boolean;
  currentSectionConfig: { title: string; items: ChecklistItem[] } | null;
  onboardingChecklist: Record<string, { status: ChecklistStatus; notes: string }>;
  setOnboardingChecklist: React.Dispatch<React.SetStateAction<Record<string, { status: ChecklistStatus; notes: string }>>>;

  // Separation checklist
  isSeparationSectionForm: boolean;
  currentSeparationSectionConfig: { title: string; items: ChecklistItem[] } | null;
  separationChecklist: Record<string, { status: ChecklistStatus; notes: string }>;
  setSeparationChecklist: React.Dispatch<React.SetStateAction<Record<string, { status: ChecklistStatus; notes: string }>>>;

  // Attachments
  requestId: string;
  attachmentConfigs: WorkflowStepAttachmentConfig[];
  uploadedAttachments: RequestAttachment[];
  setUploadedAttachments: React.Dispatch<React.SetStateAction<RequestAttachment[]>>;

  // Comment
  comment: string;
  setComment: (value: string) => void;

  // Signature
  signatureInfo: SignatureInfo;
  signatureAccepted: boolean;
  setSignatureAccepted: (value: boolean) => void;

  // Canvas signature (stamp approval)
  isStampApproval: boolean;
  signatureDataUrl: string | null;
  setSignatureDataUrl: (dataUrl: string | null) => void;
  /** Kaşe görseli (imza kanvasının arkasında WYSIWYG hizalama için) */
  stampImageUrl?: string;
  /** Kaşe en/boy oranı = genişlik / yükseklik */
  stampAspectRatio?: number;

  // Travel completion (V4: göreve giden kişi gerçekleşen tarihleri + görev özetini girer)
  isTravelCompletionForm: boolean;
  actualDeparture: string;
  setActualDeparture: (value: string) => void;
  actualReturn: string;
  setActualReturn: (value: string) => void;
  assignmentSummary: string;
  setAssignmentSummary: (value: string) => void;

  // YKB imzalı PDF (Mukayese Formu COMPLETION)
  isYkbSignedPdfForm: boolean;
  ykbSignedPdfPath: string | null;
  setYkbSignedPdfPath: (value: string | null) => void;
  ykbSignedPdfFileName: string | null;
  setYkbSignedPdfFileName: (value: string | null) => void;

  // Actions
  canApprove: boolean;
  isSubmitting: boolean;
  handleDecision: (decision: "APPROVED" | "REJECTED") => void;
  handleRequestRevision: () => void;
}

export function ApprovalActions({
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
  onboardingChecklist,
  setOnboardingChecklist,
  isSeparationSectionForm,
  currentSeparationSectionConfig,
  separationChecklist,
  setSeparationChecklist,
  requestId,
  attachmentConfigs,
  uploadedAttachments,
  setUploadedAttachments,
  comment,
  setComment,
  signatureInfo,
  signatureAccepted,
  setSignatureAccepted,
  isStampApproval,
  signatureDataUrl,
  setSignatureDataUrl,
  stampImageUrl,
  stampAspectRatio,
  isTravelCompletionForm,
  actualDeparture,
  setActualDeparture,
  actualReturn,
  setActualReturn,
  assignmentSummary,
  setAssignmentSummary,
  isYkbSignedPdfForm,
  ykbSignedPdfPath,
  setYkbSignedPdfPath,
  ykbSignedPdfFileName,
  setYkbSignedPdfFileName,
  canApprove,
  isSubmitting,
  handleDecision,
  handleRequestRevision,
}: ApprovalActionsProps) {
  return (
    <div className="border-t pt-4 mt-6 space-y-4">
      {/* V4: Travel Completion Form — göreve giden kişi gerçekleşen tarihleri + görev özetini girer */}
      {isTravelCompletionForm && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm font-medium text-muted-foreground">
            Görev Tamamlama
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="actual_departure" className="text-sm font-medium">
                Gerçekleşen Gidiş Tarihi/Saati <span className="text-red-500">*</span>
              </Label>
              <Input
                id="actual_departure"
                type="datetime-local"
                value={actualDeparture}
                onChange={(e) => setActualDeparture(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actual_return" className="text-sm font-medium">
                Gerçekleşen Dönüş Tarihi/Saati <span className="text-red-500">*</span>
              </Label>
              <Input
                id="actual_return"
                type="datetime-local"
                value={actualReturn}
                onChange={(e) => setActualReturn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment_summary" className="text-sm font-medium">
              Görev Özeti / Bilgilendirme <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="assignment_summary"
              placeholder="Görevde neler yapıldığına dair kısa bir özet ve bilgilendirme yazın..."
              value={assignmentSummary}
              onChange={(e) => setAssignmentSummary(e.target.value)}
              rows={4}
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      {/* Mukayese Formu COMPLETION — YKB imzalı PDF yükleme */}
      {isYkbSignedPdfForm && (
        <YkbSignedPdfUpload
          requestId={requestId}
          uploadedPath={ykbSignedPdfPath}
          uploadedFileName={ykbSignedPdfFileName}
          onUploaded={(path, fileName) => {
            setYkbSignedPdfPath(path);
            setYkbSignedPdfFileName(fileName);
          }}
          onCleared={() => {
            setYkbSignedPdfPath(null);
            setYkbSignedPdfFileName(null);
          }}
          disabled={isSubmitting}
        />
      )}

      {/* HR Form Alanları */}
      {isHrForm && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm font-medium text-muted-foreground">
            Personel Müdürlüğü Bilgileri
          </div>
          <div className="space-y-2">
            <Label htmlFor="remaining_days" className="text-sm font-medium">
              Kalan İzin Günü <span className="text-red-500">*</span>
            </Label>
            <Input
              id="remaining_days"
              type="number"
              min="0"
              placeholder="Örn: 15"
              value={remainingDays}
              onChange={(e) => setRemainingDays(e.target.value)}
              disabled={isSubmitting}
            />
            {remainingDays && isNaN(Number(remainingDays)) && (
              <p className="text-sm text-red-500">Geçerli bir sayı giriniz</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="hr_note" className="text-sm font-medium">
              İK Notu (Opsiyonel)
            </Label>
            <Input
              id="hr_note"
              placeholder="İsteğe bağlı not ekleyebilirsiniz..."
              value={hrNote}
              onChange={(e) => setHrNote(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      {/* Salary Deduction Consent Form */}
      {isSalaryConsentForm && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm font-medium text-muted-foreground">
            Maaş Kesinti Muvafakatnamesi
          </div>
          <div className="flex items-start space-x-3 rounded-md border p-4">
            <Checkbox
              id="salary_deduction_consent"
              checked={salaryDeductionConsent}
              onCheckedChange={(checked) => setSalaryDeductionConsent(checked === true)}
              disabled={isSubmitting}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="salary_deduction_consent" className="text-sm font-medium">
                Maaş Kesinti Muvafakatı <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Maaş kesintisine ilişkin muvafakatname ilgili personelden ıslak imza ile teslim alınmıştır.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Checklist Form */}
      {isOnboardingSectionForm && currentSectionConfig && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm font-medium text-muted-foreground">
            {currentSectionConfig.title} <span className="text-red-500">*</span>
          </div>
          <div className="space-y-3">
            {currentSectionConfig.items.map((item) => (
              <div key={item.key} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium flex-1">
                    {item.label}
                  </Label>
                  <Select
                    value={onboardingChecklist[item.key]?.status || "NOT_DONE"}
                    onValueChange={(value) => {
                      setOnboardingChecklist((prev) => ({
                        ...prev,
                        [item.key]: {
                          ...prev[item.key],
                          status: value as ChecklistStatus,
                          notes: prev[item.key]?.notes || "",
                        },
                      }));
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DONE">Yapıldı</SelectItem>
                      <SelectItem value="NOT_DONE">Yapılmadı</SelectItem>
                      <SelectItem value="NA">Uygulanmaz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Açıklama (opsiyonel)..."
                  className="text-sm min-h-[60px]"
                  value={onboardingChecklist[item.key]?.notes || ""}
                  onChange={(e) => {
                    setOnboardingChecklist((prev) => ({
                      ...prev,
                      [item.key]: {
                        ...prev[item.key],
                        status: prev[item.key]?.status || "NOT_DONE",
                        notes: e.target.value,
                      },
                    }));
                  }}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Separation Checklist Form */}
      {isSeparationSectionForm && currentSeparationSectionConfig && (
        <div className="space-y-4 border-t pt-4">
          <div className="text-sm font-medium text-muted-foreground">
            {currentSeparationSectionConfig.title} <span className="text-red-500">*</span>
          </div>
          <div className="space-y-3">
            {currentSeparationSectionConfig.items.map((item) => (
              <div key={item.key} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium flex-1">
                    {item.label}
                  </Label>
                  <Select
                    value={separationChecklist[item.key]?.status || "NOT_DONE"}
                    onValueChange={(value) => {
                      setSeparationChecklist((prev) => ({
                        ...prev,
                        [item.key]: {
                          ...prev[item.key],
                          status: value as ChecklistStatus,
                          notes: prev[item.key]?.notes || "",
                        },
                      }));
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DONE">Yapıldı</SelectItem>
                      <SelectItem value="NOT_DONE">Yapılmadı</SelectItem>
                      <SelectItem value="NA">Uygulanmaz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Açıklama (opsiyonel)..."
                  className="text-sm min-h-[60px]"
                  value={separationChecklist[item.key]?.notes || ""}
                  onChange={(e) => {
                    setSeparationChecklist((prev) => ({
                      ...prev,
                      [item.key]: {
                        ...prev[item.key],
                        status: prev[item.key]?.status || "NOT_DONE",
                        notes: e.target.value,
                      },
                    }));
                  }}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ek Dosyalar */}
      {attachmentConfigs.length > 0 && (
        <AttachmentUploader
          requestId={requestId}
          configs={attachmentConfigs}
          existingFiles={uploadedAttachments}
          onUpload={(file) => setUploadedAttachments((prev) => [...prev, file])}
          onDelete={(fileId) => setUploadedAttachments((prev) => prev.filter((f) => f.id !== fileId))}
          disabled={isSubmitting}
        />
      )}

      {/* Yorum Alanı */}
      <div className="space-y-2">
        <Label htmlFor="comment">Yorum (Red veya Revize için zorunlu)</Label>
        <Input
          id="comment"
          placeholder="Yorumunuzu buraya yazın..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {/* İmza Paneli */}
      {isStampApproval ? (
        <SignatureCanvasPanel
          signatureDataUrl={signatureDataUrl}
          onSignatureChange={setSignatureDataUrl}
          isAccepted={signatureAccepted}
          onAcceptChange={setSignatureAccepted}
          title="İMZA / PARAF"
          description="Aşağıda kaşenin görüntüsü var. İmzanızı/parafınızı doğrudan kaşenin üzerine, kalmasını istediğiniz yere çizin — belgede aynı konum ve boyutta basılacaktır."
          disabled={isSubmitting}
          stampImageUrl={stampImageUrl}
          stampAspectRatio={stampAspectRatio}
        />
      ) : (
        <SignaturePanel
          signatureText={signatureInfo.signatureText}
          signatureFont={signatureInfo.signatureFont}
          isAccepted={signatureAccepted}
          onAcceptChange={setSignatureAccepted}
          title="ONAY İMZASI"
          description="Bu talebi imzanızla onaylayacaksınız:"
          disabled={isSubmitting}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-1 min-w-[140px]"
          onClick={() => handleDecision("APPROVED")}
          disabled={isSubmitting || !canApprove}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          İmzala ve Onayla
        </Button>
        <Button
          variant="outline"
          className="flex-1 min-w-[140px] border-orange-500 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          onClick={() => handleRequestRevision()}
          disabled={isSubmitting || !comment.trim()}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Revize İste
        </Button>
        <Button
          variant="destructive"
          className="flex-1 min-w-[140px]"
          onClick={() => handleDecision("REJECTED")}
          disabled={isSubmitting || !comment.trim()}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reddet
        </Button>
      </div>
    </div>
  );
}
