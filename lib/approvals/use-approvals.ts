"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { WorkflowStepAttachmentConfig, RequestAttachment, PreviousStepAttachment } from "@/lib/workflow/types";
import type { PendingApproval, ChecklistStatus, SignatureInfo } from "./types";
import { onboardingSectionConfig, ONBOARDING_SECTION_KEYS } from "./constants";

export function useApprovals() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // HR form states
  const [remainingDays, setRemainingDays] = useState<string>("");
  const [hrNote, setHrNote] = useState<string>("");

  // Salary deduction consent state
  const [salaryDeductionConsent, setSalaryDeductionConsent] = useState(false);

  // Onboarding checklist state
  const [onboardingChecklist, setOnboardingChecklist] = useState<
    Record<string, { status: ChecklistStatus; notes: string }>
  >({});

  // Attachment states
  const [attachmentConfigs, setAttachmentConfigs] = useState<WorkflowStepAttachmentConfig[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<RequestAttachment[]>([]);
  const [previousStepAttachments, setPreviousStepAttachments] = useState<PreviousStepAttachment[]>([]);

  // Signature states
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const supabase = createClient();

  // Derived values
  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);

  const isHrForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                   selectedApproval?.workflow_step?.form_section_key === 'hr_details';

  const isSalaryConsentForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                              selectedApproval?.workflow_step?.form_section_key === 'salary_deduction_consent';

  const onboardingSectionKey = selectedApproval?.workflow_step?.form_section_key || '';
  const isOnboardingSectionForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.request?.onboarding_request != null &&
    (ONBOARDING_SECTION_KEYS as readonly string[]).includes(onboardingSectionKey);

  const currentSectionConfig = isOnboardingSectionForm
    ? onboardingSectionConfig[onboardingSectionKey]
    : null;

  const hrFormValid = !isHrForm || (remainingDays.trim() !== "" && !isNaN(Number(remainingDays)));
  const salaryConsentFormValid = !isSalaryConsentForm || salaryDeductionConsent;
  const onboardingFormValid = !isOnboardingSectionForm || (
    currentSectionConfig != null &&
    currentSectionConfig.items.every((item) => onboardingChecklist[item.key]?.status != null)
  );
  const attachmentsValid = attachmentConfigs
    .filter((c) => c.is_required)
    .every((c) => uploadedAttachments.some((f) => f.step_attachment_config_id === c.id));

  const canApprove = hasValidSignature && signatureAccepted && hrFormValid && salaryConsentFormValid && onboardingFormValid && attachmentsValid;

  // Pagination
  const totalPages = Math.ceil(approvalHistory.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedHistory = approvalHistory.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page: number) => setCurrentPage(page);
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  // API functions
  const loadSignatureInfo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: appUser } = await supabase
        .from("app_users")
        .select(`employee:employees(signature_text, signature_font)`)
        .eq("id", user.id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const employee = appUser?.employee as any;
      if (employee) {
        setSignatureInfo({
          signatureText: employee.signature_text,
          signatureFont: employee.signature_font,
        });
      }
    } catch (error) {
      console.error("Error loading signature:", error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAttachmentData = useCallback(async (workflowStepId: string, requestId: string) => {
    try {
      const { data: configs } = await supabase
        .from("workflow_step_attachments")
        .select("*")
        .eq("workflow_step_id", workflowStepId);

      if (configs && configs.length > 0) {
        setAttachmentConfigs(configs);
        const { data: files } = await supabase
          .from("request_attachments")
          .select("*")
          .eq("request_id", requestId)
          .in("step_attachment_config_id", configs.map((c: { id: string }) => c.id));
        setUploadedAttachments(files || []);
      }
    } catch (error) {
      console.error("Error fetching attachment data:", error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPreviousStepAttachments = useCallback(async (requestId: string) => {
    try {
      const { data: files } = await supabase
        .from("request_attachments")
        .select("id, file_name, file_size, mime_type, config:workflow_step_attachments(label, workflow_step:workflow_steps(form_section_key))")
        .eq("request_id", requestId);

      if (files && files.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: PreviousStepAttachment[] = files.map((f: any) => ({
          id: f.id,
          file_name: f.file_name,
          file_size: f.file_size,
          mime_type: f.mime_type,
          config_label: f.config?.label || "",
          section_key: f.config?.workflow_step?.form_section_key || "",
        }));
        setPreviousStepAttachments(mapped);
      } else {
        setPreviousStepAttachments([]);
      }
    } catch (error) {
      console.error("Error fetching previous step attachments:", error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchApprovals = useCallback(async () => {
    try {
      const response = await fetch("/api/approvals");
      if (response.ok) {
        const data = await response.json();
        setPendingApprovals(data.pending || []);
        setApprovalHistory(data.history || []);
      }
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (!selectedApproval) return;
    if (decision === "REJECTED" && !comment.trim()) {
      toast.error("Red için yorum zorunludur");
      return;
    }

    // HR form validasyonu
    if (decision === "APPROVED" && isHrForm) {
      if (!remainingDays.trim() || isNaN(Number(remainingDays))) {
        toast.error("Kalan izin günü zorunludur");
        return;
      }
    }

    // Salary consent form validasyonu
    if (decision === "APPROVED" && isSalaryConsentForm) {
      if (!salaryDeductionConsent) {
        toast.error("Maaş kesinti muvafakatını onaylamanız gerekiyor");
        return;
      }
    }

    // Onboarding section form validasyonu
    if (decision === "APPROVED" && isOnboardingSectionForm && currentSectionConfig) {
      const missingItems = currentSectionConfig.items.filter(
        (item) => !onboardingChecklist[item.key]?.status
      );
      if (missingItems.length > 0) {
        toast.error("Tüm checklist alanlarının durumu seçilmelidir");
        return;
      }
    }

    // Zorunlu attachment validasyonu
    if (decision === "APPROVED" && attachmentConfigs.length > 0) {
      const missingAttachments = attachmentConfigs
        .filter((c) => c.is_required)
        .filter((c) => !uploadedAttachments.some((f) => f.step_attachment_config_id === c.id));
      if (missingAttachments.length > 0) {
        const labels = missingAttachments.map((c) => c.label).join(", ");
        toast.error(`Zorunlu ek dosyalar yüklenmemiş: ${labels}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const requestBody: {
        decision: string;
        comment: string;
        hr_fields?: { remaining_days: number; hr_note?: string };
        salary_consent_fields?: { consent: boolean };
        onboarding_fields?: { section_key: string; items: Record<string, { status: string; notes: string }> };
      } = { decision, comment };

      if (decision === "APPROVED" && isHrForm) {
        requestBody.hr_fields = {
          remaining_days: Number(remainingDays),
          hr_note: hrNote.trim() || undefined,
        };
      }
      if (decision === "APPROVED" && isSalaryConsentForm) {
        requestBody.salary_consent_fields = { consent: salaryDeductionConsent };
      }
      if (decision === "APPROVED" && isOnboardingSectionForm) {
        requestBody.onboarding_fields = {
          section_key: onboardingSectionKey,
          items: onboardingChecklist,
        };
      }

      const response = await fetch(`/api/approvals/${selectedApproval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "İşlem başarısız");
      }

      toast.success(decision === "APPROVED" ? "Talep onaylandı" : "Talep reddedildi");
      setSelectedApproval(null);
      setComment("");
      setRemainingDays("");
      setHrNote("");
      setSalaryDeductionConsent(false);
      setOnboardingChecklist({});
      setAttachmentConfigs([]);
      setUploadedAttachments([]);
      fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async (requestId: string) => {
    try {
      toast.loading("PDF indiriliyor...");
      const response = await fetch(`/api/requests/${requestId}/pdf`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "PDF indirilemedi");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `talep_${requestId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.dismiss();
      toast.success("PDF indirildi");
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : "PDF indirilemedi");
    }
  };

  // Effects
  useEffect(() => {
    fetchApprovals();
    loadSignatureInfo();
  }, [fetchApprovals, loadSignatureInfo]);

  useEffect(() => {
    setSignatureAccepted(false);
    setRemainingDays("");
    setHrNote("");
    setSalaryDeductionConsent(false);
    setAttachmentConfigs([]);
    setUploadedAttachments([]);
    setPreviousStepAttachments([]);

    if (selectedApproval?.request?.onboarding_request && selectedApproval?.workflow_step?.form_section_key) {
      const sectionKey = selectedApproval.workflow_step.form_section_key;
      const config = onboardingSectionConfig[sectionKey];
      const ob = selectedApproval.request.onboarding_request;
      if (config) {
        const initial: Record<string, { status: ChecklistStatus; notes: string }> = {};
        config.items.forEach((item) => {
          const statusVal = ob[`${item.key}_status`] as ChecklistStatus | null;
          const notesVal = ob[`${item.key}_notes`] as string | null;
          initial[item.key] = {
            status: statusVal || "NOT_DONE",
            notes: notesVal || "",
          };
        });
        setOnboardingChecklist(initial);
      } else {
        setOnboardingChecklist({});
      }
    } else {
      setOnboardingChecklist({});
    }

    if (selectedApproval?.workflow_step?.id && selectedApproval?.request?.id) {
      fetchAttachmentData(selectedApproval.workflow_step.id, selectedApproval.request.id);
    }

    // Onboarding veya overtime request ise önceki adımlardaki ekleri de çek
    if ((selectedApproval?.request?.onboarding_request || selectedApproval?.request?.overtime_request) && selectedApproval?.request?.id) {
      fetchPreviousStepAttachments(selectedApproval.request.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApproval]);

  return {
    // Data
    pendingApprovals,
    approvalHistory,
    paginatedHistory,
    selectedApproval,
    isLoading,
    isSubmitting,
    comment,
    signatureInfo,
    signatureAccepted,
    remainingDays,
    hrNote,
    salaryDeductionConsent,
    onboardingChecklist,
    attachmentConfigs,
    uploadedAttachments,
    previousStepAttachments,

    // Derived
    isHrForm,
    isSalaryConsentForm,
    isOnboardingSectionForm,
    currentSectionConfig,
    onboardingSectionKey,
    canApprove,
    hasValidSignature,
    hrFormValid,

    // Pagination
    currentPage,
    pageSize,
    totalPages,

    // Setters
    setSelectedApproval,
    setComment,
    setSignatureAccepted,
    setRemainingDays,
    setHrNote,
    setSalaryDeductionConsent,
    setOnboardingChecklist,
    setUploadedAttachments,

    // Handlers
    handleDecision,
    handleDownloadPDF,
    handlePageChange,
    handlePageSizeChange,
  };
}
