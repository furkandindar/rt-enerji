"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { WorkflowStepAttachmentConfig, RequestAttachment, PreviousStepAttachment } from "@/lib/workflow/types";
import type { PendingApproval, ChecklistStatus, SignatureInfo } from "./types";
import { onboardingSectionConfig, ONBOARDING_SECTION_KEYS, separationSectionConfig, SEPARATION_SECTION_KEYS } from "./constants";
import { parseContentDispositionFilename } from "@/lib/pdf/file-naming";
import { normalizePageSize } from "@/components/ui/pagination-controls";

// Hangi liste fetch'i yapılacağını belirler. Bekleyen ve geçmiş artık ayrı
// sayfalarda olduğu için aynı anda iki liste yüklenmiyor:
//   - 'pending' → /approvals (Bekleyen Onaylar) sayfası
//   - 'history' → /approvals/history (Onay Geçmişi) sayfası
//   - 'none'    → detail page (/approvals/[id]) gibi liste'siz yerler
export type ApprovalsMode = 'pending' | 'history' | 'none';

interface UseApprovalsOptions {
  mode?: ApprovalsMode;
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const { mode = 'none' } = options;
  const pendingEnabled = mode === 'pending';
  const historyEnabled = mode === 'history';

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PendingApproval[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  // Filter dropdown'unu beslemek için tüm aktif workflow definitions
  const [workflowDefinitions, setWorkflowDefinitions] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  // İlk fetch tamamlanma flag'leri — isLoading bu ikisinden derived edilir.
  // Sadece enable edilmiş liste için "loaded false" başlangıcı; diğeri için
  // initial true (fetch yok = beklenecek bir şey yok).
  const [pendingLoaded, setPendingLoaded] = useState(!pendingEnabled);
  const [historyLoaded, setHistoryLoaded] = useState(!historyEnabled);
  const isLoading = !pendingLoaded || !historyLoaded;
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

  // Separation checklist state
  const [separationChecklist, setSeparationChecklist] = useState<
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

  // Canvas signature state (stamp approval için)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Travel assignment completion state (asistan gerçekleşen tarihleri girer)
  const [actualDeparture, setActualDeparture] = useState("");
  const [actualReturn, setActualReturn] = useState("");

  // YKB signed PDF upload state (mukayese formu COMPLETION fazı)
  const [ykbSignedPdfPath, setYkbSignedPdfPath] = useState<string | null>(null);
  const [ykbSignedPdfFileName, setYkbSignedPdfFileName] = useState<string | null>(null);

  // Pagination state — URL'den okunur (pending_page, pending_size, history_page, history_size)
  const pendingPageSize = normalizePageSize(searchParams.get("pending_size"));
  const historyPageSize = normalizePageSize(searchParams.get("history_size"));
  const pendingPage = (() => {
    const n = Number(searchParams.get("pending_page"));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  })();
  const historyPage = (() => {
    const n = Number(searchParams.get("history_page"));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  })();

  // Filter state — URL'den okunur. "all" = filtre yok.
  const pendingWorkflowFilter = searchParams.get("pending_workflow_code") || "all";
  const historyWorkflowFilter = searchParams.get("history_workflow_code") || "all";
  const historyDecisionFilter = searchParams.get("history_decision") || "all";

  const supabase = createClient();

  // Derived values
  const isStampApproval = selectedApproval?.request?.stamp_request != null;
  const hasValidSignature = isStampApproval
    ? Boolean(signatureDataUrl)
    : Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);

  const isHrForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                   selectedApproval?.workflow_step?.form_section_key === 'hr_details';

  const isSalaryConsentForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                              selectedApproval?.workflow_step?.form_section_key === 'salary_deduction_consent';

  const formSectionKey = selectedApproval?.workflow_step?.form_section_key || '';

  const onboardingSectionKey = formSectionKey;
  const isOnboardingSectionForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.request?.onboarding_request != null &&
    (ONBOARDING_SECTION_KEYS as readonly string[]).includes(formSectionKey);

  const currentSectionConfig = isOnboardingSectionForm
    ? onboardingSectionConfig[formSectionKey]
    : null;

  const separationSectionKey = formSectionKey;
  const isSeparationSectionForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.request?.separation_request != null &&
    (SEPARATION_SECTION_KEYS as readonly string[]).includes(formSectionKey);

  const currentSeparationSectionConfig = isSeparationSectionForm
    ? separationSectionConfig[formSectionKey]
    : null;

  // V4: COMPLETION fazı — asistanın gerçekleşen tarihleri girme formu
  const isTravelCompletionForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.workflow_step?.form_section_key === 'actual_dates' &&
    selectedApproval?.request?.travel_assignment_request != null;

  // Mukayese Formu COMPLETION fazı — asistan imzalı taranmış PDF yükler
  const isYkbSignedPdfForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.workflow_step?.form_section_key === 'ykb_signed_pdf';

  const hrFormValid = !isHrForm || (remainingDays.trim() !== "" && !isNaN(Number(remainingDays)));
  const salaryConsentFormValid = !isSalaryConsentForm || salaryDeductionConsent;
  const onboardingFormValid = !isOnboardingSectionForm || (
    currentSectionConfig != null &&
    currentSectionConfig.items.every((item) => onboardingChecklist[item.key]?.status != null)
  );
  const separationFormValid = !isSeparationSectionForm || (
    currentSeparationSectionConfig != null &&
    currentSeparationSectionConfig.items.every((item) => separationChecklist[item.key]?.status != null)
  );
  const attachmentsValid = attachmentConfigs
    .filter((c) => c.is_required)
    .every((c) => uploadedAttachments.some((f) => f.step_attachment_config_id === c.id));

  const travelCompletionFormValid = !isTravelCompletionForm || (actualDeparture.trim() !== "" && actualReturn.trim() !== "");

  const ykbSignedPdfFormValid = !isYkbSignedPdfForm || Boolean(ykbSignedPdfPath);

  const canApprove = hasValidSignature && signatureAccepted && hrFormValid && salaryConsentFormValid && onboardingFormValid && separationFormValid && attachmentsValid && travelCompletionFormValid && ykbSignedPdfFormValid;

  // Pagination — server-side, total/total_pages API'den geliyor
  const pendingTotalPages = Math.max(Math.ceil(pendingTotal / pendingPageSize), 1);
  const historyTotalPages = Math.max(Math.ceil(historyTotal / historyPageSize), 1);

  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handlePendingPageChange = useCallback(
    (page: number) => updateUrlParams({ pending_page: page > 1 ? page.toString() : null }),
    [updateUrlParams]
  );
  const handlePendingPageSizeChange = useCallback(
    (value: string) => updateUrlParams({ pending_size: value, pending_page: null }),
    [updateUrlParams]
  );
  const handleHistoryPageChange = useCallback(
    (page: number) => updateUrlParams({ history_page: page > 1 ? page.toString() : null }),
    [updateUrlParams]
  );
  const handleHistoryPageSizeChange = useCallback(
    (value: string) => updateUrlParams({ history_size: value, history_page: null }),
    [updateUrlParams]
  );

  // Filter handler'ları — filtre değişince sayfayı 1'e reset
  const handlePendingWorkflowFilterChange = useCallback(
    (value: string) =>
      updateUrlParams({
        pending_workflow_code: value === "all" ? null : value,
        pending_page: null,
      }),
    [updateUrlParams]
  );
  const handleHistoryWorkflowFilterChange = useCallback(
    (value: string) =>
      updateUrlParams({
        history_workflow_code: value === "all" ? null : value,
        history_page: null,
      }),
    [updateUrlParams]
  );
  const handleHistoryDecisionFilterChange = useCallback(
    (value: string) =>
      updateUrlParams({
        history_decision: value === "all" ? null : value,
        history_page: null,
      }),
    [updateUrlParams]
  );

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

  const fetchPending = useCallback(
    async (
      page: number,
      size: number,
      workflowCode: string,
      signal?: AbortSignal
    ) => {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          page_size: size.toString(),
        });
        if (workflowCode && workflowCode !== "all") {
          params.set("workflow_code", workflowCode);
        }
        const response = await fetch(`/api/approvals/pending?${params.toString()}`, { signal });
        if (response.ok) {
          const data = await response.json();
          setPendingApprovals(data.items || []);
          setPendingTotal(typeof data.total === "number" ? data.total : 0);
          if (Array.isArray(data.workflowDefinitions)) {
            setWorkflowDefinitions(data.workflowDefinitions);
          }
        }
      } catch (error) {
        // AbortError: cleanup tarafından iptal edildi, sessizce geç
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Error fetching pending approvals:", error);
      }
    },
    []
  );

  const fetchHistory = useCallback(
    async (
      page: number,
      size: number,
      workflowCode: string,
      decision: string,
      signal?: AbortSignal
    ) => {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          page_size: size.toString(),
        });
        if (workflowCode && workflowCode !== "all") {
          params.set("workflow_code", workflowCode);
        }
        if (decision && decision !== "all") {
          params.set("decision", decision);
        }
        const response = await fetch(`/api/approvals/history?${params.toString()}`, { signal });
        if (response.ok) {
          const data = await response.json();
          setApprovalHistory(data.items || []);
          setHistoryTotal(typeof data.total === "number" ? data.total : 0);
          if (Array.isArray(data.workflowDefinitions)) {
            setWorkflowDefinitions(data.workflowDefinitions);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Error fetching approval history:", error);
      }
    },
    []
  );

  // Karar verildikten sonra aktif liste'yi yenile. Detail page'de mode='none'
  // olduğu için no-op; pending sayfasında pending'i, history sayfasında
  // history'i yeniler.
  const fetchApprovals = useCallback(async () => {
    if (pendingEnabled) await fetchPending(pendingPage, pendingPageSize, pendingWorkflowFilter);
    if (historyEnabled) await fetchHistory(historyPage, historyPageSize, historyWorkflowFilter, historyDecisionFilter);
  }, [
    pendingEnabled,
    historyEnabled,
    fetchPending,
    fetchHistory,
    pendingPage,
    pendingPageSize,
    pendingWorkflowFilter,
    historyPage,
    historyPageSize,
    historyWorkflowFilter,
    historyDecisionFilter,
  ]);

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

    // YKB imzalı PDF validasyonu (Mukayese Formu COMPLETION)
    if (decision === "APPROVED" && isYkbSignedPdfForm) {
      if (!ykbSignedPdfPath) {
        toast.error("İmzalı PDF yüklenmeden onaylanamaz");
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
        separation_fields?: { section_key: string; items: Record<string, { status: string; notes: string }> };
        travel_completion_fields?: { actual_departure_at: string; actual_return_at: string };
        signature_data_url?: string;
        ykb_signed_pdf_path?: string;
      } = { decision, comment };

      // Stamp approval ise canvas imzasını gönder
      if (decision === "APPROVED" && isStampApproval && signatureDataUrl) {
        requestBody.signature_data_url = signatureDataUrl;
      }

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
      if (decision === "APPROVED" && isSeparationSectionForm) {
        requestBody.separation_fields = {
          section_key: separationSectionKey,
          items: separationChecklist,
        };
      }
      if (decision === "APPROVED" && isTravelCompletionForm) {
        requestBody.travel_completion_fields = {
          actual_departure_at: new Date(actualDeparture).toISOString(),
          actual_return_at: new Date(actualReturn).toISOString(),
        };
      }
      if (decision === "APPROVED" && isYkbSignedPdfForm && ykbSignedPdfPath) {
        requestBody.ykb_signed_pdf_path = ykbSignedPdfPath;
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
      setSeparationChecklist({});
      setActualDeparture("");
      setActualReturn("");
      setYkbSignedPdfPath(null);
      setYkbSignedPdfFileName(null);
      setAttachmentConfigs([]);
      setUploadedAttachments([]);
      fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  // V5: Onaycı "revize iste" diyor — comment zorunlu, request_approvals → REVISION_REQUESTED
  const handleRequestRevision = async () => {
    if (!selectedApproval) return;
    if (!comment.trim()) {
      toast.error("Revize için yorum zorunludur");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/approvals/${selectedApproval.id}/request-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Revize istenemedi");
      }

      toast.success("Revize istendi");
      setSelectedApproval(null);
      setComment("");
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
      const fileName =
        parseContentDispositionFilename(response.headers.get("Content-Disposition")) ||
        `talep_${requestId}.pdf`;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
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
  // Signature info'yu her zaman yükle (detail page'de de gerekli).
  useEffect(() => {
    loadSignatureInfo();
  }, [loadSignatureInfo]);

  // Pending list — mount + page/size/filter değişimi. AbortController ile
  // Strict Mode double-mount fetch'ini iptal ediyoruz; aynı şekilde page
  // hızlıca değişirse önceki fetch iptal olur (race condition korumalı).
  useEffect(() => {
    if (!pendingEnabled) return;
    const controller = new AbortController();
    (async () => {
      await fetchPending(pendingPage, pendingPageSize, pendingWorkflowFilter, controller.signal);
      if (!controller.signal.aborted) setPendingLoaded(true);
    })();
    return () => controller.abort();
  }, [pendingEnabled, pendingPage, pendingPageSize, pendingWorkflowFilter, fetchPending]);

  // History list — mount + page/size/filter değişimi
  useEffect(() => {
    if (!historyEnabled) return;
    const controller = new AbortController();
    (async () => {
      await fetchHistory(historyPage, historyPageSize, historyWorkflowFilter, historyDecisionFilter, controller.signal);
      if (!controller.signal.aborted) setHistoryLoaded(true);
    })();
    return () => controller.abort();
  }, [historyEnabled, historyPage, historyPageSize, historyWorkflowFilter, historyDecisionFilter, fetchHistory]);

  // Page out-of-range guard: karar verilince ya da kayıt silinince mevcut
  // sayfa son sayfayı geçtiyse URL'i son sayfaya çek (1'in altına düşmez).
  useEffect(() => {
    if (!pendingEnabled || isLoading) return;
    if (pendingPage > pendingTotalPages) {
      handlePendingPageChange(pendingTotalPages);
    }
  }, [pendingEnabled, isLoading, pendingPage, pendingTotalPages, handlePendingPageChange]);

  useEffect(() => {
    if (!historyEnabled || isLoading) return;
    if (historyPage > historyTotalPages) {
      handleHistoryPageChange(historyTotalPages);
    }
  }, [historyEnabled, isLoading, historyPage, historyTotalPages, handleHistoryPageChange]);

  useEffect(() => {
    setSignatureAccepted(false);
    setSignatureDataUrl(null);
    setRemainingDays("");
    setHrNote("");
    setSalaryDeductionConsent(false);
    setYkbSignedPdfPath(null);
    setYkbSignedPdfFileName(null);
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

    if (selectedApproval?.request?.separation_request && selectedApproval?.workflow_step?.form_section_key) {
      const sectionKey = selectedApproval.workflow_step.form_section_key;
      const config = separationSectionConfig[sectionKey];
      const sr = selectedApproval.request.separation_request;
      if (config) {
        const initial: Record<string, { status: ChecklistStatus; notes: string }> = {};
        config.items.forEach((item) => {
          const statusVal = sr[`${item.key}_status`] as ChecklistStatus | null;
          const notesVal = sr[`${item.key}_notes`] as string | null;
          initial[item.key] = {
            status: statusVal || "NOT_DONE",
            notes: notesVal || "",
          };
        });
        setSeparationChecklist(initial);
      } else {
        setSeparationChecklist({});
      }
    } else {
      setSeparationChecklist({});
    }

    if (selectedApproval?.workflow_step?.id && selectedApproval?.request?.id) {
      fetchAttachmentData(selectedApproval.workflow_step.id, selectedApproval.request.id);
    }

    // Önceki adımlarda yüklenen ek dosyaları her zaman çek; talep türünden bağımsız
    // (hiç attachment olmayan türlerde sorgu boş array döner, yan etki yoktur).
    if (selectedApproval?.request?.id) {
      fetchPreviousStepAttachments(selectedApproval.request.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApproval]);

  return {
    // Data
    pendingApprovals,
    approvalHistory,
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
    actualDeparture,
    actualReturn,
    ykbSignedPdfPath,
    ykbSignedPdfFileName,
    attachmentConfigs,
    uploadedAttachments,
    previousStepAttachments,

    // Derived
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
    canApprove,
    hasValidSignature,
    hrFormValid,

    // Pagination — server-side
    pendingPage,
    pendingPageSize,
    pendingTotal,
    pendingTotalPages,
    historyPage,
    historyPageSize,
    historyTotal,
    historyTotalPages,

    // Filters
    workflowDefinitions,
    pendingWorkflowFilter,
    historyWorkflowFilter,
    historyDecisionFilter,

    // Setters
    setSelectedApproval,
    setComment,
    setSignatureAccepted,
    setSignatureDataUrl,
    setRemainingDays,
    setHrNote,
    setSalaryDeductionConsent,
    setOnboardingChecklist,
    setSeparationChecklist,
    setActualDeparture,
    setActualReturn,
    setYkbSignedPdfPath,
    setYkbSignedPdfFileName,
    setUploadedAttachments,

    // Handlers
    handleDecision,
    handleRequestRevision,
    handleDownloadPDF,
    handlePendingPageChange,
    handlePendingPageSizeChange,
    handleHistoryPageChange,
    handleHistoryPageSizeChange,
    handlePendingWorkflowFilterChange,
    handleHistoryWorkflowFilterChange,
    handleHistoryDecisionFilterChange,
  };
}
