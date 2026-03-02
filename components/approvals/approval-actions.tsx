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
import { AttachmentUploader } from "@/components/attachment-uploader";
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

  // Actions
  canApprove: boolean;
  isSubmitting: boolean;
  handleDecision: (decision: "APPROVED" | "REJECTED") => void;
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
  requestId,
  attachmentConfigs,
  uploadedAttachments,
  setUploadedAttachments,
  comment,
  setComment,
  signatureInfo,
  signatureAccepted,
  setSignatureAccepted,
  canApprove,
  isSubmitting,
  handleDecision,
}: ApprovalActionsProps) {
  return (
    <div className="border-t pt-4 mt-6 space-y-4">
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
        <Label htmlFor="comment">Yorum (Red için zorunlu)</Label>
        <Input
          id="comment"
          placeholder="Yorumunuzu buraya yazın..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {/* İmza Paneli */}
      <SignaturePanel
        signatureText={signatureInfo.signatureText}
        signatureFont={signatureInfo.signatureFont}
        isAccepted={signatureAccepted}
        onAcceptChange={setSignatureAccepted}
        title="ONAY İMZASI"
        description="Bu talebi imzanızla onaylayacaksınız:"
        disabled={isSubmitting}
      />

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => handleDecision("APPROVED")}
          disabled={isSubmitting || !canApprove}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          İmzala ve Onayla
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
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
