"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye, Download } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  overtimeTypeLabels,
  financeExpenseAreaLabels,
  financeFundingSourceLabels,
  accountingCapacityTypeLabels,
} from "@/lib/approvals/constants";
import { getApproverDisplayName } from "@/lib/approvals/types";
import { AttachmentList } from "@/components/approvals/attachment-list";
import { ComparisonFormDetails } from "@/components/approvals/comparison-form-details";
import { RequestActivityLog } from "@/components/approvals/request-activity-log";
import { ApprovalStatusBadge, RequestStatusBadge } from "@/components/approvals/status-badge";
import { RequestLifecycleActions } from "@/components/my-requests/request-lifecycle-actions";
import type {
  RequestStatus as RequestLifecycleActionsStatus,
  ApprovalStatus as RequestLifecycleActionsApprovalStatus,
} from "@/lib/workflow/types";
import { RichTextDisplay } from "@/components/ui/rich-text-display";

export interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
}

export interface LeaveRequestData {
  leave_type: string;
  start_datetime: string;
  end_datetime: string;
  total_days: number;
  reason?: string;
  address_during_leave?: string;
}

export interface EmployeePosition {
  position: {
    id: string;
    title: string;
  };
  is_primary: boolean;
  end_date: string | null;
}

export interface Requester {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string;
  employee_positions: EmployeePosition[];
}

export interface Approver {
  id: string;
  first_name: string;
  last_name: string;
}

export interface WorkflowStep {
  step_order: number;
  name: string;
  approver_type?: 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION' | 'DYNAMIC_USER_LIST';
  phase?: 'APPROVAL' | 'COMPLETION';
  form_section_key?: string | null;
}

export interface Approval {
  id: string;
  status: string;
  comment: string | null;
  decided_at: string | null;
  created_at: string;
  sequence_order: number;
  revision_cycle?: number | null;
  workflow_step: WorkflowStep;
  approver: Approver;
}

export interface SalaryAdvanceRequest {
  id: string;
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER';
  salary_deduction_consent: boolean;
}

export interface OvertimeEntry {
  id: string;
  full_name: string;
  role_title: string;
  overtime_hours: number;
  overtime_pay: number;
}

export interface OvertimeRequest {
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
  previous_shift_start: string | null;
  previous_shift_end: string | null;
  next_shift_start: string | null;
  next_shift_end: string | null;
  work_reason: string | null;
  total_hours: number | null;
  total_pay: number | null;
  entries?: OvertimeEntry[];
}

export interface OnboardingRequestData {
  id: string;
  employee_name: string | null;
  employee_title: string | null;
  department: string | null;
  location: string | null;
  job_description: string | null;
  reporting_manager: string | null;
  start_date: string | null;
  employment_period: string | null;
}

export interface RequestFormRequestData {
  id: string;
  requester_name: string;
  company: string;
  request_date: string;
  subject: string;
  content: string;
  quantity: string | null;
  amount: number | null;
  reason: string | null;
  request_type: string;
}

export interface SeparationRequestData {
  id: string;
  employee_name: string | null;
  employee_title: string | null;
  department: string | null;
  location: string | null;
  job_description: string | null;
  reporting_manager: string | null;
  separation_date: string | null;
  separation_reason: string | null;
  employment_period: string | null;
  annual_leave_days: number | null;
  annual_leave_amount: number | null;
  severance_days: number | null;
  severance_amount: number | null;
  notice_weeks: number | null;
  notice_amount: number | null;
}

export interface Request {
  id: string;
  request_no: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at?: string | null;
  pdf_path?: string | null;
  workflow_definition: WorkflowDefinition;
  leave_request?: LeaveRequestData;
  salary_advance_request?: SalaryAdvanceRequest;
  overtime_request?: OvertimeRequest;
  onboarding_request?: OnboardingRequestData;
  separation_request?: SeparationRequestData;
  request_form_request?: RequestFormRequestData;
  travel_assignment_request?: {
    id: string;
    company: { id: string; name: string } | null;
    assignment_subject: string;
    destination_city: string;
    destination_institution: string;
    estimated_departure_at: string;
    estimated_return_at: string;
    transportation_type: string;
    transportation_cost: number;
    accommodation_needed: boolean;
    accommodation_cost: number;
    advance_requested: boolean;
    actual_departure_at: string | null;
    actual_return_at: string | null;
  };
  stamp_request?: {
    id: string;
    original_pdf_path: string;
    stamped_pdf_path: string | null;
    selected_pages: string;
    stamp_position: string;
    subject: string | null;
    description: string | null;
    stamp: {
      id: string;
      name: string;
    };
  };
  finance_approval_cover_request?: {
    id: string;
    subject: string;
    request_date: string;
    document_no: string;
    account_available: boolean;
    cash_flow_recorded: boolean;
    expense_area: string;
    funding_source: string;
    has_rt_enerji_proforma: boolean;
    items?: Array<{
      id: string;
      row_order: number;
      item_date: string;
      company_name: string;
      payee_name: string;
      item_subject: string;
      invoice_amount: number;
      payable_amount: number;
    }>;
  };
  accounting_approval_cover_request?: {
    id: string;
    subject: string;
    request_date: string;
    document_no: string;
    demirbas_registered: boolean;
    has_dispatch_note: boolean;
    has_delivery_info: boolean;
    has_invoice_record: boolean;
    has_accounting_prog_entry: boolean;
    has_arvento_record: boolean;
    paid_from_credit: boolean;
    items?: Array<{
      id: string;
      row_order: number;
      item_date: string;
      company_name: string;
      payee_name: string;
      item_subject: string;
      capacity_type: string;
      invoice_amount: number;
      payable_amount: number;
    }>;
  };
  approval_letter_request?: {
    id: string;
    letter_date: string;
    company: string;
    project: string;
    subject: string;
    content: string;
    has_payment_table: boolean;
    comparison_approval_date: string | null;
    agreement_amount: string | null;
    has_contract: boolean | null;
    paid_amounts: string[];
    remaining_payment: string | null;
    requested_payment_amount: string | null;
    remaining_after_payment: string | null;
  };
  mukayese_request?: {
    id: string;
    project_title: string;
    form_currency: 'TRY' | 'USD' | 'EUR';
    form_date: string;
    preparer_full_name: string;
    company: string;
    subject: string;
    request_content: string;
    request_amount_text: string;
    request_reason: string;
    notes: string | null;
    kdv_rate: number;
    fx_eur_try: number | null;
    fx_usd_try: number | null;
    fx_eur_usd: number | null;
    fx_snapshot_at: string | null;
    items?: Array<{
      id: string;
      row_order: number;
      row_type: 'ITEM' | 'SUBTOTAL';
      description: string | null;
      quantity: number | null;
      unit: 'ADET' | 'SET' | 'GUN' | null;
    }>;
    suppliers?: Array<{
      id: string;
      column_order: number;
      company_name: string;
      payment_terms: string | null;
      technical_description: string | null;
      delivery_time: string | null;
      contact_name: string | null;
      contact_phone: string | null;
    }>;
    prices?: Array<{
      id: string;
      mukayese_item_id: string;
      mukayese_supplier_id: string;
      unit_price: number;
    }>;
  };
  expense_request?: {
    id: string;
    request_date: string;
    project_name: string;
    project_code: string;
    is_travel: boolean;
    work_or_destination: string;
    travel_person_count: number | null;
    travel_date: string | null;
    travel_duration: string | null;
    advance_amount: number | null;
    items?: Array<{
      id: string;
      row_order: number;
      item_date: string;
      document_no: string | null;
      description: string;
      amount: number;
    }>;
  };
  requester?: Requester;
  approvals?: Approval[];
  // Faz 1 etkinlik logu: tüm cycle'ların onay kayıtları (API tarafından eklenir).
  all_approvals?: Approval[];
  // Lifecycle son aksiyon snapshot'ı (V5).
  submitted_at?: string | null;
  completed_at?: string | null;
  last_action?: string | null;
  last_action_at?: string | null;
  last_action_by?: string | null;
  current_revision_cycle?: number | null;
}

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  config_label: string;
}

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
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

const requestFormTypeLabels: Record<string, string> = {
  MUTFAK: "Mutfak",
  KIRTASIYE: "Kırtasiye",
  DIGER: "Diğer",
};

const stampPositionLabels: Record<string, string> = {
  "top-left": "Sol Üst",
  "top-right": "Sağ Üst",
  center: "Orta",
  "bottom-left": "Sol Alt",
  "bottom-right": "Sağ Alt",
};

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

interface RequestDetailContentProps {
  request: Request;
  attachments: Attachment[];
  onChange?: () => void;
  onDownloadPDF: (requestId: string) => void;
  onShowPdfPreview: () => void;
  onShowLivePreview: () => void;
}

export function RequestDetailContent({
  request: selectedRequest,
  attachments,
  onChange,
  onDownloadPDF,
  onShowPdfPreview,
  onShowLivePreview,
}: RequestDetailContentProps) {
  // Aksiyon butonlarının görünürlük koşulları (header sağ tarafa taşındı).
  const pdfButtonsVisible =
    !!selectedRequest &&
    (selectedRequest.status === "APPROVED" ||
      selectedRequest.status === "AWAITING_COMPLETION" ||
      selectedRequest.status === "COMPLETED" ||
      (selectedRequest.status === "REJECTED" && !!selectedRequest.pdf_path));

  const livePreviewVisible =
    !!selectedRequest &&
    !selectedRequest.stamp_request &&
    (selectedRequest.status === "PENDING" ||
      selectedRequest.status === "AWAITING_COMPLETION");

  return (
    <>
      {/* Header — sol: başlık, sağ: aksiyon butonları (lifecycle + PDF) */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Talep Detayları</h2>
          <p className="text-sm text-muted-foreground">
            {selectedRequest?.workflow_definition?.name || "Talep"} detaylarını görüntülüyorsunuz
          </p>
        </div>
        {selectedRequest && (
          <div className="flex flex-wrap items-center gap-2">
            {/* V5: Yaşam döngüsü aksiyonları (Geri Çek / Düzenle / Yeniden Gönder / İptal) */}
            <RequestLifecycleActions
              request={{
                id: selectedRequest.id,
                status: selectedRequest.status as RequestLifecycleActionsStatus,
                workflow_definition: selectedRequest.workflow_definition
                  ? { code: selectedRequest.workflow_definition.code }
                  : null,
                approvals: (selectedRequest.approvals ?? []).map((a) => ({
                  status: a.status as RequestLifecycleActionsApprovalStatus,
                  approver_type: a.workflow_step?.approver_type,
                })),
              }}
              onChange={onChange}
            />
            {livePreviewVisible && (
              <Button variant="outline" size="sm" onClick={onShowLivePreview}>
                <Eye className="mr-2 h-4 w-4" />
                Anlık Önizleme
              </Button>
            )}
            {pdfButtonsVisible && (
              <>
                <Button variant="outline" size="sm" onClick={onShowPdfPreview}>
                  <Eye className="mr-2 h-4 w-4" />
                  PDF Görüntüle
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownloadPDF(selectedRequest.id)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF İndir
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {selectedRequest && (
        <div className="grid grid-cols-1 gap-4 p-4">
          {/* Kompakt ortak alanlar — tek satırda 5 sütun (responsive). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Talep No</p>
              <p className="text-sm font-mono font-semibold">
                {selectedRequest.request_no || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Talep Sahibi</p>
              <p className="text-sm font-semibold">
                {getRequesterFullName(selectedRequest.requester)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ünvan</p>
              <p className="text-sm font-semibold">
                {getRequesterPosition(selectedRequest.requester)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Talep Tipi</p>
              <p className="text-sm font-semibold">
                {selectedRequest.workflow_definition?.name || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Durum</p>
              <RequestStatusBadge status={selectedRequest.status} />
            </div>
          </div>

          {/* Leave Request specific fields */}
          {selectedRequest.leave_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İzin Türü</p>
                  <p className="text-sm font-semibold">
                    {leaveTypeLabels[selectedRequest.leave_request.leave_type] || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Toplam Gün</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.leave_request.total_days || "-"} gün
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Başlangıç</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedRequest.leave_request.start_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bitiş</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedRequest.leave_request.end_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
                  </p>
                </div>
              </div>
              {selectedRequest.leave_request.reason && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İzin Nedeni</p>
                  <p className="text-sm font-semibold">{selectedRequest.leave_request.reason}</p>
                </div>
              )}
            </>
          )}

          {/* Salary Advance Request specific fields */}
          {selectedRequest.salary_advance_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avans Miktarı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.salary_advance_request.amount.toLocaleString('tr-TR')} TL
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ödeme Şekli</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.salary_advance_request.payment_method === 'CASH' ? 'Nakit' : 'Banka Havalesi'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Maaş Kesinti Muvafakatı</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.salary_advance_request.salary_deduction_consent ? 'Onaylandı' : 'Onaylanmadı'}
                </p>
              </div>
            </>
          )}

          {/* Overtime Request specific fields */}
          {selectedRequest.overtime_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Fazla Mesai Tipi</p>
                  <p className="text-sm font-semibold">
                    {overtimeTypeLabels[selectedRequest.overtime_request.overtime_type]}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Dönem</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.overtime_request.month} {selectedRequest.overtime_request.year}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Neden Kategorisi</p>
                  <p className="text-sm font-semibold">
                    {overtimeReasonLabels[selectedRequest.overtime_request.reason_category]}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Talep Eden Kişi/Durum</p>
                <p className="text-sm font-semibold">{selectedRequest.overtime_request.reason_detail}</p>
              </div>

              {/* EMERGENCY specific fields */}
              {selectedRequest.overtime_request.overtime_type === 'EMERGENCY' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Çalışma Yeri</p>
                      <p className="text-sm font-semibold">{selectedRequest.overtime_request.work_location || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Çalışma Nedeni</p>
                      <p className="text-sm font-semibold">{selectedRequest.overtime_request.work_reason || "-"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Çalışma Başlangıç</p>
                      <p className="text-sm font-semibold">
                        {selectedRequest.overtime_request.work_start_date
                          ? format(new Date(selectedRequest.overtime_request.work_start_date), "d MMM yyyy HH:mm", { locale: tr })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Çalışma Bitiş</p>
                      <p className="text-sm font-semibold">
                        {selectedRequest.overtime_request.work_end_date
                          ? format(new Date(selectedRequest.overtime_request.work_end_date), "d MMM yyyy HH:mm", { locale: tr })
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Önceki Vardiya</p>
                      <p className="text-sm font-semibold">
                        {selectedRequest.overtime_request.previous_shift_start
                          ? `${format(new Date(selectedRequest.overtime_request.previous_shift_start), "dd/MM/yyyy HH:mm", { locale: tr })} – ${selectedRequest.overtime_request.previous_shift_end ? format(new Date(selectedRequest.overtime_request.previous_shift_end), "dd/MM/yyyy HH:mm", { locale: tr }) : "-"}`
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sonraki Vardiya</p>
                      <p className="text-sm font-semibold">
                        {selectedRequest.overtime_request.next_shift_start
                          ? `${format(new Date(selectedRequest.overtime_request.next_shift_start), "dd/MM/yyyy HH:mm", { locale: tr })} – ${selectedRequest.overtime_request.next_shift_end ? format(new Date(selectedRequest.overtime_request.next_shift_end), "dd/MM/yyyy HH:mm", { locale: tr }) : "-"}`
                          : "-"}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* STAFF_SHORTAGE specific fields */}
              {selectedRequest.overtime_request.overtime_type === 'STAFF_SHORTAGE' && selectedRequest.overtime_request.entries && (
                <div className="space-y-4">
                  {selectedRequest.overtime_request.work_location && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Merkez, Şube ve İşletmeler</p>
                      <p className="text-sm font-semibold">{selectedRequest.overtime_request.work_location}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Çalışan Listesi</p>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ad Soyad</TableHead>
                          <TableHead>Rol/Unvan</TableHead>
                          <TableHead>FM Saati</TableHead>
                          <TableHead>Ücret (TL)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRequest.overtime_request.entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{entry.full_name}</TableCell>
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
                      <p className="text-sm font-semibold">{selectedRequest.overtime_request.total_hours || 0} saat</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Toplam Ücret</p>
                      <p className="text-sm font-semibold">{(selectedRequest.overtime_request.total_pay || 0).toLocaleString('tr-TR')} TL</p>
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {selectedRequest.overtime_request.hr_note && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İK Notu</p>
                  <p className="text-sm font-semibold">{selectedRequest.overtime_request.hr_note}</p>
                </div>
              )}
            </>
          )}

          {/* Onboarding Request specific fields */}
          {selectedRequest.onboarding_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İşe Başlayacak Kişi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.employee_name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unvanı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.employee_title || "-"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Departmanı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.department || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Lokasyonu</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.location || "-"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">İş Tanımı / Kapsamı / Kodu</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.onboarding_request.job_description || "-"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bağlı Olduğu Yönetici</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.reporting_manager || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İşe Giriş Tarihi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.onboarding_request.start_date
                      ? format(new Date(selectedRequest.onboarding_request.start_date), "d MMMM yyyy", { locale: tr })
                      : "-"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Şirketimizde Bulunacağı Zaman Aralığı</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.onboarding_request.employment_period || "-"}
                </p>
              </div>
            </>
          )}

          {/* Separation Request specific fields */}
          {selectedRequest.separation_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İşten Ayrılan Kişi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.separation_request.employee_name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unvanı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.separation_request.employee_title || "-"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Departmanı / Lokasyonu</p>
                  <p className="text-sm font-semibold">
                    {[selectedRequest.separation_request.department, selectedRequest.separation_request.location].filter(Boolean).join(" / ") || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bağlı Olduğu Yönetici</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.separation_request.reporting_manager || "-"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">İşten Çıkış Tarihi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.separation_request.separation_date
                      ? format(new Date(selectedRequest.separation_request.separation_date), "d MMMM yyyy", { locale: tr })
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Çalışma Süresi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.separation_request.employment_period || "-"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Ayrılış Sebebi</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.separation_request.separation_reason || "-"}
                </p>
              </div>
            </>
          )}

          {/* Request Form specific fields */}
          {selectedRequest.request_form_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Eden</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.request_form_request.requester_name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Şirket</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.request_form_request.company || "-"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Tarihi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.request_form_request.request_date
                      ? format(new Date(selectedRequest.request_form_request.request_date), "d MMMM yyyy", { locale: tr })
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Türü</p>
                  <p className="text-sm font-semibold">
                    {requestFormTypeLabels[selectedRequest.request_form_request.request_type] || selectedRequest.request_form_request.request_type}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Konu</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.request_form_request.subject || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Talep İçeriği</p>
                <p className="text-sm font-semibold whitespace-pre-wrap">
                  {selectedRequest.request_form_request.content || "-"}
                </p>
              </div>
              {selectedRequest.request_form_request.quantity && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Miktarı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.request_form_request.quantity}
                  </p>
                </div>
              )}
              {selectedRequest.request_form_request.amount != null && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Tutarı</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.request_form_request.amount.toLocaleString("tr-TR")} TL
                  </p>
                </div>
              )}
              {selectedRequest.request_form_request.reason && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Nedeni</p>
                  <p className="text-sm font-semibold whitespace-pre-wrap">
                    {selectedRequest.request_form_request.reason}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Stamp Request specific fields */}
          {selectedRequest.stamp_request && (
            <>
              {selectedRequest.stamp_request.subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Konu</p>
                  <p className="text-sm font-semibold">{selectedRequest.stamp_request.subject}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kaşe</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.stamp_request.stamp?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kaşe Konumu</p>
                  <p className="text-sm font-semibold">
                    {stampPositionLabels[selectedRequest.stamp_request.stamp_position] || selectedRequest.stamp_request.stamp_position}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kaşelenecek Sayfalar</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.stamp_request.selected_pages === "all"
                      ? "Tüm sayfalar"
                      : `Sayfa: ${selectedRequest.stamp_request.selected_pages}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Durum</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.stamp_request.stamped_pdf_path ? "Kaşelenmiş ✓" : "Kaşelenmedi"}
                  </p>
                </div>
              </div>
              {selectedRequest.stamp_request.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Açıklama</p>
                  <p className="text-sm font-semibold whitespace-pre-wrap">
                    {selectedRequest.stamp_request.description}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Travel Assignment Request specific fields */}
          {selectedRequest.travel_assignment_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Şirket</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.travel_assignment_request.company?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ulaşım Aracı</p>
                  <p className="text-sm font-semibold">
                    {({
                      COMPANY_VEHICLE: "Şirket Aracı",
                      RENTAL_VEHICLE: "Kiralık Araç",
                      AIRPLANE: "Uçak",
                      OTHER: "Diğer",
                    } as Record<string, string>)[selectedRequest.travel_assignment_request.transportation_type] || "-"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Görev Konusu</p>
                <p className="text-sm font-semibold">{selectedRequest.travel_assignment_request.assignment_subject}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Görev Şehri</p>
                  <p className="text-sm font-semibold">{selectedRequest.travel_assignment_request.destination_city}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Görev Kurumu</p>
                  <p className="text-sm font-semibold">{selectedRequest.travel_assignment_request.destination_institution}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tahmini Çıkış</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedRequest.travel_assignment_request.estimated_departure_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tahmini Dönüş</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedRequest.travel_assignment_request.estimated_return_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ulaşım Bedeli</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.travel_assignment_request.transportation_cost.toLocaleString('tr-TR')} TL
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Konaklama</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.travel_assignment_request.accommodation_needed
                      ? `Var - ${selectedRequest.travel_assignment_request.accommodation_cost.toLocaleString('tr-TR')} TL`
                      : "Yok"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avans Talebi</p>
                <p className="text-sm font-semibold">
                  {selectedRequest.travel_assignment_request.advance_requested ? "Var" : "Yok"}
                </p>
              </div>
              {selectedRequest.travel_assignment_request.actual_departure_at && (
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gerçekleşen Gidiş</p>
                    <p className="text-sm font-semibold">
                      {format(new Date(selectedRequest.travel_assignment_request.actual_departure_at), "d MMM yyyy HH:mm", { locale: tr })}
                    </p>
                  </div>
                  {selectedRequest.travel_assignment_request.actual_return_at && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Gerçekleşen Dönüş</p>
                      <p className="text-sm font-semibold">
                        {format(new Date(selectedRequest.travel_assignment_request.actual_return_at), "d MMM yyyy HH:mm", { locale: tr })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Approval Letter Request specific fields */}
          {selectedRequest.approval_letter_request && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tarih</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(selectedRequest.approval_letter_request.letter_date), "d MMM yyyy", { locale: tr })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Firma</p>
                  <p className="text-sm font-semibold">{selectedRequest.approval_letter_request.company}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Proje</p>
                <p className="text-sm font-semibold">{selectedRequest.approval_letter_request.project}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Konu</p>
                <p className="text-sm font-semibold">{selectedRequest.approval_letter_request.subject}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Yazı</p>
                <RichTextDisplay content={selectedRequest.approval_letter_request.content} />
              </div>
              {selectedRequest.approval_letter_request.has_payment_table && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold">Ödeme Tablosu</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Karşılaştırma Onay Tarihi:</span>
                    <span className="font-medium">
                      {selectedRequest.approval_letter_request.comparison_approval_date
                        ? format(new Date(selectedRequest.approval_letter_request.comparison_approval_date), "d MMM yyyy", { locale: tr })
                        : "-"}
                    </span>
                    <span className="text-muted-foreground">Anlaşma Tutarı:</span>
                    <span className="font-medium">{selectedRequest.approval_letter_request.agreement_amount || "-"}</span>
                    <span className="text-muted-foreground">Sözleşme:</span>
                    <span className="font-medium">{selectedRequest.approval_letter_request.has_contract ? "VAR" : "YOK"}</span>
                    {(selectedRequest.approval_letter_request.paid_amounts || []).map((amount: string, idx: number) => (
                      <div key={idx} className="contents">
                        <span className="text-muted-foreground">Ödenen ({idx + 1}):</span>
                        <span className="font-medium">{amount || "-"}</span>
                      </div>
                    ))}
                    <span className="text-muted-foreground">Kalan Ödeme:</span>
                    <span className="font-medium">{selectedRequest.approval_letter_request.remaining_payment || "-"}</span>
                    <span className="text-muted-foreground">Ödenmesi Talep Edilen:</span>
                    <span className="font-medium">{selectedRequest.approval_letter_request.requested_payment_amount || "-"}</span>
                    <span className="text-muted-foreground">Bu Ödeme Sonrası Kalan:</span>
                    <span className="font-medium">{selectedRequest.approval_letter_request.remaining_after_payment || "-"}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Finance Approval Cover specific fields */}
          {selectedRequest.finance_approval_cover_request && (() => {
            const fin = selectedRequest.finance_approval_cover_request;
            const items = [...(fin.items || [])].sort((a, b) => a.row_order - b.row_order);
            const totalInvoice = items.reduce((sum, it) => sum + Number(it.invoice_amount || 0), 0);
            const totalPayable = items.reduce((sum, it) => sum + Number(it.payable_amount || 0), 0);
            const fmt = (v: number) => new Intl.NumberFormat("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(v);
            return (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tarih</p>
                    <p className="text-sm font-semibold">
                      {format(new Date(fin.request_date), "d MMMM yyyy", { locale: tr })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sayı</p>
                    <p className="text-sm font-semibold">{fin.document_no}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Konu</p>
                  <p className="text-sm font-semibold">{fin.subject}</p>
                </div>
                {items.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold">Ödeme Kalemleri</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-1.5 pr-2 font-medium">Tarih</th>
                            <th className="py-1.5 pr-2 font-medium">Firma</th>
                            <th className="py-1.5 pr-2 font-medium">Ödenecek</th>
                            <th className="py-1.5 pr-2 font-medium">Konu</th>
                            <th className="py-1.5 pr-2 font-medium text-right">Fatura (TL)</th>
                            <th className="py-1.5 font-medium text-right">Ödenecek (TL)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b last:border-0 align-top">
                              <td className="py-1.5 pr-2 whitespace-nowrap">
                                {format(new Date(it.item_date), "d MMM yyyy", { locale: tr })}
                              </td>
                              <td className="py-1.5 pr-2">{it.company_name}</td>
                              <td className="py-1.5 pr-2">{it.payee_name}</td>
                              <td className="py-1.5 pr-2">{it.item_subject}</td>
                              <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                                {fmt(Number(it.invoice_amount))}
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {fmt(Number(it.payable_amount))}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td colSpan={4} className="py-1.5 pr-2 text-right">Toplam</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(totalInvoice)}</td>
                            <td className="py-1.5 text-right whitespace-nowrap">{fmt(totalPayable)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold">Değerlendirme</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Hesapta Para:</span>
                    <span className="font-medium">{fin.account_available ? "Evet" : "Hayır"}</span>
                    <span className="text-muted-foreground">Nakit Akış Kaydı:</span>
                    <span className="font-medium">{fin.cash_flow_recorded ? "Yapıldı" : "Yapılmadı"}</span>
                    <span className="text-muted-foreground">Harcama Alanı:</span>
                    <span className="font-medium">
                      {financeExpenseAreaLabels[fin.expense_area] || fin.expense_area}
                    </span>
                    <span className="text-muted-foreground">Niteliği:</span>
                    <span className="font-medium">
                      {financeFundingSourceLabels[fin.funding_source] || fin.funding_source}
                    </span>
                    <span className="text-muted-foreground">RT Enerji Proforması:</span>
                    <span className="font-medium">{fin.has_rt_enerji_proforma ? "Var" : "Yok"}</span>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Accounting Approval Cover specific fields */}
          {selectedRequest.accounting_approval_cover_request && (() => {
            const acc = selectedRequest.accounting_approval_cover_request;
            const items = [...(acc.items || [])].sort((a, b) => a.row_order - b.row_order);
            const totalInvoice = items.reduce((sum, it) => sum + Number(it.invoice_amount || 0), 0);
            const totalPayable = items.reduce((sum, it) => sum + Number(it.payable_amount || 0), 0);
            const fmt = (v: number) => new Intl.NumberFormat("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(v);
            return (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tarih</p>
                    <p className="text-sm font-semibold">
                      {format(new Date(acc.request_date), "d MMMM yyyy", { locale: tr })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sayı</p>
                    <p className="text-sm font-semibold">{acc.document_no}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Konu</p>
                  <p className="text-sm font-semibold">{acc.subject}</p>
                </div>
                {items.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold">Ödeme Kalemleri</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-1.5 pr-2 font-medium">Tarih</th>
                            <th className="py-1.5 pr-2 font-medium">Firma</th>
                            <th className="py-1.5 pr-2 font-medium">Ödenecek</th>
                            <th className="py-1.5 pr-2 font-medium">Konu</th>
                            <th className="py-1.5 pr-2 font-medium">Kapasite</th>
                            <th className="py-1.5 pr-2 font-medium text-right">Fatura (TL)</th>
                            <th className="py-1.5 font-medium text-right">Ödenecek (TL)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b last:border-0 align-top">
                              <td className="py-1.5 pr-2 whitespace-nowrap">
                                {format(new Date(it.item_date), "d MMM yyyy", { locale: tr })}
                              </td>
                              <td className="py-1.5 pr-2">{it.company_name}</td>
                              <td className="py-1.5 pr-2">{it.payee_name}</td>
                              <td className="py-1.5 pr-2">{it.item_subject}</td>
                              <td className="py-1.5 pr-2 whitespace-nowrap">
                                {accountingCapacityTypeLabels[it.capacity_type] || it.capacity_type}
                              </td>
                              <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                                {fmt(Number(it.invoice_amount))}
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {fmt(Number(it.payable_amount))}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td colSpan={5} className="py-1.5 pr-2 text-right">Toplam</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(totalInvoice)}</td>
                            <td className="py-1.5 text-right whitespace-nowrap">{fmt(totalPayable)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold">Değerlendirme</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Demirbaş kaydı:</span>
                    <span className="font-medium">{acc.demirbas_registered ? "Var" : "Yok"}</span>
                    <span className="text-muted-foreground">İrsaliye:</span>
                    <span className="font-medium">{acc.has_dispatch_note ? "Var" : "Yok"}</span>
                    <span className="text-muted-foreground">Teslim alan/eden bilgisi:</span>
                    <span className="font-medium">{acc.has_delivery_info ? "Var" : "Yok"}</span>
                    <span className="text-muted-foreground">Fatura kaydı – İcmal:</span>
                    <span className="font-medium">{acc.has_invoice_record ? "Var" : "Yok"}</span>
                    <span className="text-muted-foreground">Muhasebe programına giriş:</span>
                    <span className="font-medium">{acc.has_accounting_prog_entry ? "Yapıldı" : "Yapılmadı"}</span>
                    <span className="text-muted-foreground">Arvento kaydı:</span>
                    <span className="font-medium">{acc.has_arvento_record ? "Var" : "Yok"}</span>
                    <span className="text-muted-foreground">Krediden mi ödeniyor?:</span>
                    <span className="font-medium">{acc.paid_from_credit ? "Evet" : "Hayır"}</span>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Mukayese Formu specific fields */}
          {selectedRequest.mukayese_request && (
            <ComparisonFormDetails
              mukayese={selectedRequest.mukayese_request}
              approvals={selectedRequest.approvals}
            />
          )}

          {/* Harcama Formu specific fields */}
          {selectedRequest.expense_request && (() => {
            const exp = selectedRequest.expense_request;
            const items = [...(exp.items || [])].sort((a, b) => a.row_order - b.row_order);
            const totalAmount = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
            const advance = Number(exp.advance_amount || 0);
            const balance = advance - totalAmount;
            const fmt = (v: number) => new Intl.NumberFormat("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(v);
            return (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tarih</p>
                    <p className="text-sm font-semibold">
                      {format(new Date(exp.request_date), "d MMMM yyyy", { locale: tr })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Proje Adı</p>
                    <p className="text-sm font-semibold">{exp.project_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Proje Kodu</p>
                    <p className="text-sm font-semibold">{exp.project_code}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {exp.is_travel ? "Seyahat Yapılan Yer" : "İşin Adı"}
                    </p>
                    <p className="text-sm font-semibold">{exp.work_or_destination}</p>
                  </div>
                </div>
                {exp.is_travel && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Seyahat Eden Kişi Sayısı</p>
                      <p className="text-sm font-semibold">{exp.travel_person_count ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Seyahat Tarihi</p>
                      <p className="text-sm font-semibold">
                        {exp.travel_date
                          ? format(new Date(exp.travel_date), "d MMMM yyyy", { locale: tr })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Seyahat Süresi</p>
                      <p className="text-sm font-semibold">{exp.travel_duration || "-"}</p>
                    </div>
                  </div>
                )}
                {items.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-semibold">Harcama Kalemleri</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-1.5 pr-2 font-medium w-10">Sıra</th>
                            <th className="py-1.5 pr-2 font-medium">Tarih</th>
                            <th className="py-1.5 pr-2 font-medium">Evrak No</th>
                            <th className="py-1.5 pr-2 font-medium">Açıklama</th>
                            <th className="py-1.5 font-medium text-right">Tutar (TL)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b last:border-0 align-top">
                              <td className="py-1.5 pr-2">{it.row_order}</td>
                              <td className="py-1.5 pr-2 whitespace-nowrap">
                                {format(new Date(it.item_date), "d MMM yyyy", { locale: tr })}
                              </td>
                              <td className="py-1.5 pr-2">{it.document_no || "-"}</td>
                              <td className="py-1.5 pr-2">{it.description}</td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {fmt(Number(it.amount))}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td colSpan={4} className="py-1.5 pr-2 text-right">Toplam</td>
                            <td className="py-1.5 text-right whitespace-nowrap">{fmt(totalAmount)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold">Özet</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Avans Tutarı (a):</span>
                    <span className="font-medium text-right">{fmt(advance)} TL</span>
                    <span className="text-muted-foreground">Harcamalar Toplamı (b):</span>
                    <span className="font-medium text-right">{fmt(totalAmount)} TL</span>
                    <span className="text-muted-foreground">Bakiye Tutar (a-b):</span>
                    <span className="font-semibold text-right">{fmt(balance)} TL</span>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Ek Dosyalar - tüm talep tipleri için */}
          <AttachmentList attachments={attachments} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Onay Adımı</p>
              <p className="text-sm font-semibold">
                {selectedRequest.current_step}/{selectedRequest.approvals?.length || 0}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Oluşturulma</p>
              <p className="text-sm font-semibold">
                {format(new Date(selectedRequest.created_at), "d MMMM yyyy HH:mm", { locale: tr })}
              </p>
            </div>
          </div>

          {/* Süreç Logu — tüm cycle'lar + lifecycle olayları */}
          <RequestActivityLog request={selectedRequest} />

          {/* Onay Geçmişi - Accordion (default açık, aktif cycle adımları) */}
          {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
            <Accordion
              type="single"
              collapsible
              defaultValue="approval-history"
              className="mt-4"
            >
              <AccordionItem value="approval-history">
                <AccordionTrigger className="text-sm font-medium">
                  Onay Geçmişi {/* ({selectedRequest.approvals.length}) */}
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
                          {selectedRequest.approvals
                            .sort((a, b) => a.sequence_order - b.sequence_order)
                            .map((approval) => (
                              <TableRow key={approval.id}>
                                <TableCell className="font-medium">
                                  {approval.workflow_step.step_order}
                                </TableCell>
                                <TableCell>
                                  {getApproverDisplayName(approval)}
                                </TableCell>
                                <TableCell>
                                  <ApprovalStatusBadge status={approval.status} />
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

          {/* PDF & Anlık Önizleme butonları artık header'ın sağında. */}
        </div>
      )}
    </>
  );
}
