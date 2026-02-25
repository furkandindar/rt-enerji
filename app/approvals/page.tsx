"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye, Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { SignatureFont } from "@/lib/signature/types";
import type { WorkflowStepAttachmentConfig, RequestAttachment } from "@/lib/workflow/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EmployeePosition {
  position: {
    id: string;
    title: string;
  };
  is_primary: boolean;
  end_date: string | null;
}

interface Requester {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string;
  employee_positions: EmployeePosition[];
}

interface Approver {
  id: string;
  first_name: string;
  last_name: string;
}

interface WorkflowStep {
  step_order: number;
  name: string;
}

interface Approval {
  id: string;
  status: string;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
  workflow_step: WorkflowStep;
  approver: Approver;
}

interface SalaryAdvanceRequest {
  id: string;
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER';
  salary_deduction_consent: boolean;
}

interface OvertimeEntry {
  id: string;
  role_title: string;
  overtime_hours: number;
  overtime_pay: number;
}

interface OvertimeRequest {
  id: string;
  overtime_type: 'EMERGENCY' | 'STAFF_SHORTAGE';
  month: string;
  year: number;
  reason_category: string;
  reason_detail: string;
  hr_note: string | null;
  work_location: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  previous_shift: string | null;
  next_shift: string | null;
  work_reason: string | null;
  total_hours: number | null;
  total_pay: number | null;
  entries?: OvertimeEntry[];
}

interface PendingApproval {
  id: string;
  status: string;
  decided_at: string | null;
  workflow_step: {
    id: string;
    name: string;
    step_order: number;
    action_type: 'FILL_AND_SIGN' | 'SIGN_ONLY';
    form_section_key: string | null;
  };
  request: {
    id: string;
    status: string;
    current_step: number;
    created_at: string;
    workflow_definition: {
      name: string;
    };
    requester: Requester;
    leave_request?: {
      leave_type: string;
      start_datetime: string;
      end_datetime: string;
      total_days: number;
      remaining_days: number | null;
      reason: string | null;
      hr_note: string | null;
    };
    salary_advance_request?: SalaryAdvanceRequest;
    overtime_request?: OvertimeRequest;
    onboarding_request?: {
      id: string;
      employee_name: string | null;
      employee_title: string | null;
      department: string | null;
      location: string | null;
      job_description: string | null;
      reporting_manager: string | null;
      start_date: string | null;
      employment_period: string | null;
      [key: string]: string | null | undefined;
    };
    approvals?: Approval[];
  };
}

// Onboarding checklist section tanımları
interface ChecklistItem {
  key: string;
  label: string;
}

const onboardingSectionConfig: Record<string, { title: string; items: ChecklistItem[] }> = {
  section_2: {
    title: "Mail İşlemleri",
    items: [
      { key: "mail_setup", label: "Mail Adresinin Açılması" },
      { key: "mail_groups", label: "Ekleneceği Mail/Sharepoint/Bulut Grupları" },
    ],
  },
  section_3: {
    title: "İK İşlemleri",
    items: [
      { key: "exit_reason_check", label: "İşten Çıkış Sebebi Kontrolü" },
      { key: "sgk_verification", label: "CV/SGK Kontrolü" },
      { key: "pdks_card", label: "PDKS Kayıtları" },
      { key: "guidelines_delivery", label: "Yönergelerin Teslimi" },
      { key: "stationery_request", label: "Kırtasiye Talepleri" },
      { key: "desk_cabinet", label: "Masa/Dolap Tanımı" },
      { key: "phone_setup", label: "Sabit Telefon" },
      { key: "hiring_announcement", label: "İşe Alım Duyurusu" },
      { key: "contact_info", label: "Adres/Mobil Bilgileri" },
      { key: "org_chart", label: "Organizasyon Şeması" },
      { key: "sgk_iskur_notification", label: "SGK/İşkur/Emniyet Bildirimleri" },
      { key: "safety_instructions", label: "İş Güvenliği Talimatları" },
      { key: "entry_registration", label: "İşe Giriş İşlemleri" },
      { key: "documents_upload", label: "Evrakların Bulut'a Yüklenmesi" },
    ],
  },
  section_4: {
    title: "Sözleşme İşlemleri",
    items: [
      { key: "contract_signature", label: "İş Sözleşmesi/Zimmet İmzalatılması" },
      { key: "s4_guidelines_delivery", label: "Yönergelerin Teslimi" },
    ],
  },
  section_5: {
    title: "IT İşlemleri",
    items: [
      { key: "computer_setup", label: "Bilgisayar Temini" },
      { key: "qnap_o365_ip", label: "QNAP/O365/IP Telefon Kaydı" },
    ],
  },
  section_6: {
    title: "Diğer",
    items: [
      { key: "smoking_info", label: "Sigara Kullanımı" },
      { key: "evaluation_calendar", label: "Değerlendirme Form Tarihlerinin Takvime Kaydı" },
    ],
  },
};

type ChecklistStatus = "DONE" | "NOT_DONE" | "NA";

const checklistStatusLabels: Record<ChecklistStatus, string> = {
  DONE: "Yapıldı",
  NOT_DONE: "Yapılmadı",
  NA: "Uygulanmaz",
};

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
};

const overtimeTypeLabels: Record<string, string> = {
  EMERGENCY: "Acil Durum / Talep Üzerine",
  STAFF_SHORTAGE: "Personel Eksikliği / Raporlama",
};

const overtimeReasonLabels: Record<string, string> = {
  SHIFT_OUTSIDE: "Vardiya Dışı",
  NON_CONTINUOUS: "Sürekli Olmayan",
  EMERGENCY_CASE: "Acil Durumlar",
  SUDDEN_DEVELOPMENT: "Ani Gelişen",
  ON_REQUEST: "Talep Üzerine",
  STAFF_SHORTAGE: "Personel Eksikliği",
  REPORTING: "Raporlama",
  ENERGY_PRODUCTION: "7/24 Enerji Üretimi",
};

const approvalStatusLabels: Record<string, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onayladı",
  REJECTED: "Reddetti",
};

const approvalStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
};

const requestStatusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
};

const requestStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-gray-400",
};

// Signature state interface
interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // HR form states (Personel Müdürlüğü için)
  const [remainingDays, setRemainingDays] = useState<string>("");
  const [hrNote, setHrNote] = useState<string>("");

  // Salary deduction consent state (Personel Müdürlüğü - Avans için)
  const [salaryDeductionConsent, setSalaryDeductionConsent] = useState(false);

  // Onboarding checklist state
  const [onboardingChecklist, setOnboardingChecklist] = useState<
    Record<string, { status: ChecklistStatus; notes: string }>
  >({});

  // Attachment states
  const [attachmentConfigs, setAttachmentConfigs] = useState<WorkflowStepAttachmentConfig[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<RequestAttachment[]>([]);

  // Signature states
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const supabase = createClient();

  // Pagination states for approval history
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // İmza var mı?
  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);

  // HR form mu? (FILL_AND_SIGN + hr_details)
  const isHrForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                   selectedApproval?.workflow_step?.form_section_key === 'hr_details';

  // Salary deduction consent form mu? (FILL_AND_SIGN + salary_deduction_consent)
  const isSalaryConsentForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
                              selectedApproval?.workflow_step?.form_section_key === 'salary_deduction_consent';

  // Onboarding section form mu?
  const onboardingSectionKey = selectedApproval?.workflow_step?.form_section_key || '';
  const isOnboardingSectionForm = selectedApproval?.workflow_step?.action_type === 'FILL_AND_SIGN' &&
    selectedApproval?.request?.onboarding_request != null &&
    ['section_2', 'section_3', 'section_4', 'section_5', 'section_6'].includes(onboardingSectionKey);

  const currentSectionConfig = isOnboardingSectionForm
    ? onboardingSectionConfig[onboardingSectionKey]
    : null;

  // HR form için remaining_days zorunlu
  const hrFormValid = !isHrForm || (remainingDays.trim() !== "" && !isNaN(Number(remainingDays)));

  // Salary consent form için checkbox zorunlu
  const salaryConsentFormValid = !isSalaryConsentForm || salaryDeductionConsent;

  // Onboarding section form için tüm checklist item'ları doldurulmalı
  const onboardingFormValid = !isOnboardingSectionForm || (
    currentSectionConfig != null &&
    currentSectionConfig.items.every((item) => onboardingChecklist[item.key]?.status != null)
  );

  // Zorunlu attachment'lar yüklenmiş mi?
  const attachmentsValid = attachmentConfigs
    .filter((c) => c.is_required)
    .every((c) => uploadedAttachments.some((f) => f.step_attachment_config_id === c.id));

  // Onay için imza kabul edilmeli ve tüm formlar valid olmalı
  const canApprove = hasValidSignature && signatureAccepted && hrFormValid && salaryConsentFormValid && onboardingFormValid && attachmentsValid;

  const getRequesterFullName = (requester?: Requester): string => {
    if (!requester) return "-";
    return `${requester.first_name} ${requester.last_name}`;
  };

  const getRequesterPosition = (requester?: Requester): string => {
    if (!requester?.employee_positions) return "-";
    const primaryPosition = requester.employee_positions.find(
      (ep) => ep.is_primary && !ep.end_date
    );
    return primaryPosition?.position?.title || "-";
  };

  const getRequestSummary = (approval: PendingApproval): string => {
    if (approval.request.leave_request) {
      return leaveTypeLabels[approval.request.leave_request.leave_type] || approval.request.leave_request.leave_type;
    }
    if (approval.request.salary_advance_request) {
      return `${approval.request.salary_advance_request.amount.toLocaleString('tr-TR')} TL`;
    }
    if (approval.request.overtime_request) {
      const ot = approval.request.overtime_request;
      return `${ot.month} ${ot.year} - ${overtimeTypeLabels[ot.overtime_type]}`;
    }
    if (approval.request.onboarding_request) {
      return approval.request.onboarding_request.employee_name || "-";
    }
    return "-";
  };

  // Pagination calculations
  const totalPages = Math.ceil(approvalHistory.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedHistory = approvalHistory.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1); // Reset to first page when changing page size
  };

  useEffect(() => {
    fetchApprovals();
    loadSignatureInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectedApproval değiştiğinde form state'lerini sıfırla
  useEffect(() => {
    setSignatureAccepted(false);
    setRemainingDays("");
    setHrNote("");
    setSalaryDeductionConsent(false);
    setAttachmentConfigs([]);
    setUploadedAttachments([]);

    // Onboarding checklist'i sıfırla veya mevcut değerlerle doldur
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

    // Attachment config ve dosyalarını fetch et
    if (selectedApproval?.workflow_step?.id && selectedApproval?.request?.id) {
      fetchAttachmentData(
        selectedApproval.workflow_step.id,
        selectedApproval.request.id
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApproval]);

  const loadSignatureInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: appUser } = await supabase
        .from("app_users")
        .select(`
          employee:employees(
            signature_text,
            signature_font
          )
        `)
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
  };

  const fetchAttachmentData = async (workflowStepId: string, requestId: string) => {
    try {
      // Attachment config'lerini getir
      const { data: configs } = await supabase
        .from("workflow_step_attachments")
        .select("*")
        .eq("workflow_step_id", workflowStepId);

      if (configs && configs.length > 0) {
        setAttachmentConfigs(configs);

        // Mevcut yüklenmiş dosyaları getir
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
  };

  const fetchApprovals = async () => {
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
  };

  const handleDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (!selectedApproval) return;
    if (decision === "REJECTED" && !comment.trim()) {
      toast.error("Red için yorum zorunludur");
      return;
    }

    // HR form validasyonu (onay durumunda)
    if (decision === "APPROVED" && isHrForm) {
      if (!remainingDays.trim() || isNaN(Number(remainingDays))) {
        toast.error("Kalan izin günü zorunludur");
        return;
      }
    }

    // Salary consent form validasyonu (onay durumunda)
    if (decision === "APPROVED" && isSalaryConsentForm) {
      if (!salaryDeductionConsent) {
        toast.error("Maaş kesinti muvafakatını onaylamanız gerekiyor");
        return;
      }
    }

    // Onboarding section form validasyonu (onay durumunda)
    if (decision === "APPROVED" && isOnboardingSectionForm && currentSectionConfig) {
      const missingItems = currentSectionConfig.items.filter(
        (item) => !onboardingChecklist[item.key]?.status
      );
      if (missingItems.length > 0) {
        toast.error("Tüm checklist alanlarının durumu seçilmelidir");
        return;
      }
    }

    // Zorunlu attachment validasyonu (onay durumunda)
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
      // Request body hazırla
      const requestBody: {
        decision: string;
        comment: string;
        hr_fields?: { remaining_days: number; hr_note?: string };
        salary_consent_fields?: { consent: boolean };
        onboarding_fields?: { section_key: string; items: Record<string, { status: string; notes: string }> };
      } = { decision, comment };

      // HR form ise hr_fields ekle
      if (decision === "APPROVED" && isHrForm) {
        requestBody.hr_fields = {
          remaining_days: Number(remainingDays),
          hr_note: hrNote.trim() || undefined,
        };
      }

      // Salary consent form ise salary_consent_fields ekle
      if (decision === "APPROVED" && isSalaryConsentForm) {
        requestBody.salary_consent_fields = {
          consent: salaryDeductionConsent,
        };
      }

      // Onboarding section form ise onboarding_fields ekle
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

      // PDF'i blob olarak al
      const blob = await response.blob();

      // Download link oluştur
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `talep_${requestId}.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.dismiss();
      toast.success("PDF indirildi");
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : "PDF indirilemedi");
    }
  };

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

      {/* Bekleyen Onaylar Section */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Bekleyen Onaylar</h2>
          <p className="text-sm text-muted-foreground">
            İşlem yapmanız gereken talepler
          </p>
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
            <p className="text-muted-foreground">Bekleyen onayınız bulunmuyor</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Talep Sahibi</TableHead>
                  <TableHead>Talep Tipi</TableHead>
                  <TableHead>Detay</TableHead>
                  <TableHead>Oluşturulma</TableHead>
                  <TableHead className="w-[70px]">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {approval.request.requester?.first_name} {approval.request.requester?.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {approval.request.requester?.employee_no}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {approval.request.workflow_definition?.name || "-"}
                    </TableCell>
                    <TableCell>{getRequestSummary(approval)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(approval.request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedApproval(approval)}
                        title="Detay Görüntüle"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Onay Geçmişi Section */}
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Onay Geçmişi</h2>
          <p className="text-sm text-muted-foreground">
            Daha önce onayladığınız veya reddettiğiniz talepler
          </p>
        </div>

        {approvalHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 border rounded-lg">
            <p className="text-muted-foreground">Onay geçmişiniz bulunmuyor</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Talep Sahibi</TableHead>
                    <TableHead>Talep Tipi</TableHead>
                    <TableHead>Detay</TableHead>
                    <TableHead>Karar</TableHead>
                    <TableHead>Nihai Karar</TableHead>
                    <TableHead>Karar Tarihi</TableHead>
                    <TableHead className="w-[70px]">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHistory.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {approval.request.requester?.first_name} {approval.request.requester?.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {approval.request.requester?.employee_no}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {approval.request.workflow_definition?.name || "-"}
                    </TableCell>
                    <TableCell>{getRequestSummary(approval)}</TableCell>
                    <TableCell>
                      <Badge className={approvalStatusColors[approval.status]}>
                        {approvalStatusLabels[approval.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={requestStatusColors[approval.request.status]}>
                        {requestStatusLabels[approval.request.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {approval.decided_at
                        ? format(new Date(approval.decided_at), "d MMM yyyy HH:mm", { locale: tr })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedApproval(approval)}
                        title="Detay Görüntüle"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-2 py-4">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Toplam {approvalHistory.length} kayıt
              </p>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Sayfa başına:</p>
                <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Önceki
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  const showPage =
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1);

                  const showEllipsis =
                    (page === currentPage - 2 && currentPage > 3) ||
                    (page === currentPage + 2 && currentPage < totalPages - 2);

                  if (showEllipsis) {
                    return <span key={page} className="px-2 text-muted-foreground">...</span>;
                  }

                  if (!showPage) return null;

                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                      className="w-8 h-8 p-0"
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Sonraki
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Detay Sheet */}
      <Sheet open={selectedApproval !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedApproval(null);
          setComment("");
        }
      }}>
        <SheetContent className="overflow-y-auto sm:max-w-[750px]">
          <SheetHeader>
            <SheetTitle>Talep Detayları</SheetTitle>
            <SheetDescription>
              {selectedApproval?.request.workflow_definition?.name || "Talep"} detaylarını görüntülüyorsunuz
            </SheetDescription>
          </SheetHeader>
          {selectedApproval && (
            <div className="grid gap-4 p-4">
              {/* Talep Sahibi Bilgileri */}
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Tipi</p>
                  <p className="text-sm font-semibold">
                    {selectedApproval.request.workflow_definition?.name || "-"}
                  </p>
                </div>
                {/* <div>
                  <p className="text-sm font-medium text-muted-foreground">Sicil No</p>
                  <p className="text-sm font-semibold">
                    {selectedApproval.request.requester?.employee_no || "-"}
                  </p>
                </div> */}
              </div>

              {/* Leave Request specific fields */}
              {selectedApproval.request.leave_request && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">İzin Türü</p>
                      <p className="text-sm font-semibold">
                        {leaveTypeLabels[selectedApproval.request.leave_request.leave_type] || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Toplam Gün</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.leave_request.total_days || "-"} gün
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Başlangıç</p>
                      <p className="text-sm font-semibold">
                        {format(new Date(selectedApproval.request.leave_request.start_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Bitiş</p>
                      <p className="text-sm font-semibold">
                        {format(new Date(selectedApproval.request.leave_request.end_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
                      </p>
                    </div>
                  </div>
                  {selectedApproval.request.leave_request.reason && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">İzin Nedeni</p>
                      <p className="text-sm font-semibold">{selectedApproval.request.leave_request.reason}</p>
                    </div>
                  )}
                  {(selectedApproval.request.leave_request.remaining_days !== null ||
                    selectedApproval.request.leave_request.hr_note) && (
                    <div className="grid grid-cols-2 gap-4 border-t pt-3 mt-1">
                      {selectedApproval.request.leave_request.remaining_days !== null && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Kalan İzin Günü</p>
                          <p className="text-sm font-semibold">
                            {selectedApproval.request.leave_request.remaining_days} gün
                          </p>
                        </div>
                      )}
                      {selectedApproval.request.leave_request.hr_note && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">İK Notu</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.leave_request.hr_note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Salary Advance Request specific fields */}
              {selectedApproval.request.salary_advance_request && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Avans Miktarı</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.salary_advance_request.amount.toLocaleString('tr-TR')} TL
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Ödeme Şekli</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.salary_advance_request.payment_method === 'CASH' ? 'Nakit' : 'Banka Havalesi'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Maaş Kesinti Muvafakatı</p>
                    <p className="text-sm font-semibold">
                      {selectedApproval.request.salary_advance_request.salary_deduction_consent ? 'Onaylandı' : 'Onaylanmadı'}
                    </p>
                  </div>
                </>
              )}

              {/* Overtime Request specific fields */}
              {selectedApproval.request.overtime_request && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Fazla Mesai Tipi</p>
                      <p className="text-sm font-semibold">
                        {overtimeTypeLabels[selectedApproval.request.overtime_request.overtime_type]}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Dönem</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.overtime_request.month} {selectedApproval.request.overtime_request.year}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Neden Kategorisi</p>
                      <p className="text-sm font-semibold">
                        {overtimeReasonLabels[selectedApproval.request.overtime_request.reason_category]}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Talep Eden Kişi/Durum</p>
                    <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.reason_detail}</p>
                  </div>

                  {/* EMERGENCY specific fields */}
                  {selectedApproval.request.overtime_request.overtime_type === 'EMERGENCY' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Çalışma Yeri</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.work_location || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Çalışma Nedeni</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.work_reason || "-"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Çalışma Başlangıç</p>
                          <p className="text-sm font-semibold">
                            {selectedApproval.request.overtime_request.work_start_date
                              ? format(new Date(selectedApproval.request.overtime_request.work_start_date), "d MMM yyyy HH:mm", { locale: tr })
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Çalışma Bitiş</p>
                          <p className="text-sm font-semibold">
                            {selectedApproval.request.overtime_request.work_end_date
                              ? format(new Date(selectedApproval.request.overtime_request.work_end_date), "d MMM yyyy HH:mm", { locale: tr })
                              : "-"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Önceki Mesai Saati</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.previous_shift || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Sonraki Mesai Saati</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.next_shift || "-"}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* STAFF_SHORTAGE specific fields */}
                  {selectedApproval.request.overtime_request.overtime_type === 'STAFF_SHORTAGE' && selectedApproval.request.overtime_request.entries && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Çalışan Listesi</p>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rol/Unvan</TableHead>
                              <TableHead>FM Saati</TableHead>
                              <TableHead>Ücret (TL)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedApproval.request.overtime_request.entries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>{entry.role_title}</TableCell>
                                <TableCell>{entry.overtime_hours} saat</TableCell>
                                <TableCell>{entry.overtime_pay.toLocaleString('tr-TR')} TL</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Toplam Saat</p>
                          <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.total_hours || 0} saat</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Toplam Ücret</p>
                          <p className="text-sm font-semibold">{(selectedApproval.request.overtime_request.total_pay || 0).toLocaleString('tr-TR')} TL</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedApproval.request.overtime_request.hr_note && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">İK Notu</p>
                      <p className="text-sm font-semibold">{selectedApproval.request.overtime_request.hr_note}</p>
                    </div>
                  )}
                </>
              )}

              {/* Onboarding Request specific fields */}
              {selectedApproval.request.onboarding_request && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">İşe Başlayacak Kişi</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.employee_name || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Unvanı</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.employee_title || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Departmanı</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.department || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Lokasyonu</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.location || "-"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">İş Tanımı/Kapsamı/Kodu</p>
                    <p className="text-sm font-semibold">
                      {selectedApproval.request.onboarding_request.job_description || "-"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Bağlı Olduğu Yönetici</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.reporting_manager || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">İşe Giriş Tarihi</p>
                      <p className="text-sm font-semibold">
                        {selectedApproval.request.onboarding_request.start_date
                          ? format(new Date(selectedApproval.request.onboarding_request.start_date), "d MMMM yyyy", { locale: tr })
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Zaman Aralığı</p>
                    <p className="text-sm font-semibold">
                      {selectedApproval.request.onboarding_request.employment_period || "-"}
                    </p>
                  </div>

                  {/* Daha önce doldurulmuş section'ları göster (read-only) */}
                  {Object.entries(onboardingSectionConfig).map(([sectionKey, config]) => {
                    const ob = selectedApproval.request.onboarding_request;
                    if (!ob) return null;
                    const sectionNum = parseInt(sectionKey.replace('section_', ''));
                    const currentNum = parseInt(onboardingSectionKey.replace('section_', '') || '0');
                    if (sectionNum >= currentNum && currentNum > 0) return null;
                    const firstItem = config.items[0];
                    const firstStatus = ob[`${firstItem.key}_status`];
                    if (!firstStatus || firstStatus === 'NOT_DONE') return null;

                    return (
                      <div key={sectionKey} className="border-t pt-3 mt-1">
                        <p className="text-sm font-semibold mb-2">{config.title}</p>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="py-2 text-xs">İş</TableHead>
                                <TableHead className="py-2 text-xs w-[100px]">Durum</TableHead>
                                <TableHead className="py-2 text-xs">Açıklama</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {config.items.map((item) => {
                                const status = ob[`${item.key}_status`] as string;
                                const notes = ob[`${item.key}_notes`] as string;
                                return (
                                  <TableRow key={item.key}>
                                    <TableCell className="py-2 text-sm">{item.label}</TableCell>
                                    <TableCell className="py-2">
                                      <Badge className={
                                        status === 'DONE' ? 'bg-green-500' :
                                        status === 'NA' ? 'bg-gray-400' : 'bg-yellow-500'
                                      }>
                                        {checklistStatusLabels[status as ChecklistStatus] || status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="py-2 text-sm text-muted-foreground">
                                      {notes || <span className="text-xs text-muted-foreground/50">—</span>}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

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

              {/* Onay Geçmişi - Accordion */}
              {selectedApproval.request.approvals && selectedApproval.request.approvals.length > 0 && (
                <Accordion type="single" collapsible className="mt-4">
                  <AccordionItem value="approval-history">
                    <AccordionTrigger className="text-sm font-medium">
                      Onay Geçmişi
                    </AccordionTrigger>
                    <AccordionContent>
                      <TooltipProvider>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[50px]">Adım</TableHead>
                                <TableHead>Onaylayan</TableHead>
                                <TableHead>Durum</TableHead>
                                <TableHead>Tarih</TableHead>
                                <TableHead>Yorum</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedApproval.request.approvals
                                .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order)
                                .map((approval) => (
                                  <TableRow key={approval.id}>
                                    <TableCell className="font-medium">
                                      {approval.workflow_step.step_order}
                                    </TableCell>
                                    <TableCell>
                                      {approval.approver.first_name} {approval.approver.last_name}
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={approvalStatusColors[approval.status]}>
                                        {approvalStatusLabels[approval.status]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                      {approval.decided_at
                                        ? format(new Date(approval.decided_at), "d MMM yyyy HH:mm", { locale: tr })
                                        : "-"}
                                    </TableCell>
                                    <TableCell className="max-w-[90px] text-xs">
                                      {approval.comment ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="truncate block cursor-help">
                                              {approval.comment}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-[300px]">
                                            <p className="whitespace-pre-wrap">{approval.comment}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TooltipProvider>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Onay İşlemleri - Sadece bekleyen onaylar için göster */}
              {selectedApproval.status === "PENDING" && (
                <div className="border-t pt-4 mt-6 space-y-4">

                  {/* HR Form Alanları - Sadece Personel Müdürlüğü için */}
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

                  {/* Salary Deduction Consent Form - Personel Müdürlüğü Avans için */}
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

                  {/* Onboarding Checklist Form - Section 2-6 için */}
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
                      requestId={selectedApproval.request.id}
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
              )}

              {/* Karar Bilgisi - Onay geçmişi için göster */}
              {selectedApproval.status !== "PENDING" && (
                <div className="border-t pt-4 mt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">Kararınız:</p>
                    <Badge className={approvalStatusColors[selectedApproval.status]}>
                      {approvalStatusLabels[selectedApproval.status]}
                    </Badge>
                  </div>
                  {selectedApproval.decided_at && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {format(new Date(selectedApproval.decided_at), "d MMMM yyyy HH:mm", { locale: tr })}
                    </p>
                  )}

                  {/* PDF İndirme Butonu - Sadece onaylanmış talepler için */}
                  {selectedApproval.request.status === "APPROVED" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleDownloadPDF(selectedApproval.request.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF İndir
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

