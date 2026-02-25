"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Plus, Loader2, Eye, Filter, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
}

interface LeaveRequestData {
  leave_type: string;
  start_datetime: string;
  end_datetime: string;
  total_days: number;
  reason?: string;
  address_during_leave?: string;
}

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

interface OnboardingRequestData {
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

interface Request {
  id: string;
  status: string;
  current_step: number;
  created_at: string;
  workflow_definition: WorkflowDefinition;
  leave_request?: LeaveRequestData;
  salary_advance_request?: SalaryAdvanceRequest;
  overtime_request?: OvertimeRequest;
  onboarding_request?: OnboardingRequestData;
  requester?: Requester;
  approvals?: Approval[];
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-gray-400",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
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

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Filters
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchRequests();
  }, [workflowFilter, statusFilter]);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (workflowFilter && workflowFilter !== "all") {
        params.append("workflow_code", workflowFilter);
      }
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(`/api/my-requests?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests);
        setWorkflowDefinitions(data.workflowDefinitions);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetail = (request: Request) => {
    setSelectedRequest(request);
    setIsDetailOpen(true);
  };

  const getRequestSummary = (request: Request): string => {
    if (request.leave_request) {
      return leaveTypeLabels[request.leave_request.leave_type] || request.leave_request.leave_type;
    }
    if (request.salary_advance_request) {
      return `${request.salary_advance_request.amount.toLocaleString('tr-TR')} TL`;
    }
    if (request.overtime_request) {
      const ot = request.overtime_request;
      return `${ot.month} ${ot.year} - ${overtimeTypeLabels[ot.overtime_type]}`;
    }
    if (request.onboarding_request) {
      return request.onboarding_request.employee_name || "-";
    }
    return "-";
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taleplerim</h1>
          <p className="text-muted-foreground">
            Oluşturduğunuz tüm talepleri görüntüleyin
          </p>
        </div>
        <Button asChild>
          <Link href="/leave-requests/new">
            <Plus className="mr-2 h-4 w-4" />
            Yeni Talep
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtreler:</span>
        </div>
        <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Talep Tipi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Tipler</SelectItem>
            {workflowDefinitions.map((wf) => (
              <SelectItem key={wf.id} value={wf.code}>
                {wf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Durumlar</SelectItem>
            <SelectItem value="PENDING">Beklemede</SelectItem>
            <SelectItem value="APPROVED">Onaylandı</SelectItem>
            <SelectItem value="REJECTED">Reddedildi</SelectItem>
            <SelectItem value="CANCELLED">İptal Edildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <p className="text-muted-foreground mb-4">
            {workflowFilter !== "all" || statusFilter !== "all"
              ? "Filtrelere uygun talep bulunamadı"
              : "Henüz talebiniz yok"}
          </p>
          <Button asChild>
            <Link href="/leave-requests/new">
              <Plus className="mr-2 h-4 w-4" />
              İlk Talebinizi Oluşturun
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Talep Tipi</TableHead>
                <TableHead>Detay</TableHead>
                <TableHead>Oluşturulma</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-[70px]">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {request.workflow_definition?.name || "-"}
                  </TableCell>
                  <TableCell>{getRequestSummary(request)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[request.status]}>
                      {statusLabels[request.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleViewDetail(request)}
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

      {/* Talep Detay Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-[550px]">
          <SheetHeader>
            <SheetTitle>Talep Detayları</SheetTitle>
            <SheetDescription>
              {selectedRequest?.workflow_definition?.name || "Talep"} detaylarını görüntülüyorsunuz
            </SheetDescription>
          </SheetHeader>
          {selectedRequest && (
            <div className="grid gap-4 p-4">
              {/* Talep Sahibi Bilgileri */}
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Talep Tipi</p>
                  <p className="text-sm font-semibold">
                    {selectedRequest.workflow_definition?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Durum</p>
                  <Badge className={statusColors[selectedRequest.status]}>
                    {statusLabels[selectedRequest.status]}
                  </Badge>
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
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Önceki Mesai Saati</p>
                          <p className="text-sm font-semibold">{selectedRequest.overtime_request.previous_shift || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Sonraki Mesai Saati</p>
                          <p className="text-sm font-semibold">{selectedRequest.overtime_request.next_shift || "-"}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* STAFF_SHORTAGE specific fields */}
                  {selectedRequest.overtime_request.overtime_type === 'STAFF_SHORTAGE' && selectedRequest.overtime_request.entries && (
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
                            {selectedRequest.overtime_request.entries.map((entry) => (
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
                          <p className="text-sm font-semibold">{selectedRequest.overtime_request.total_hours || 0} saat</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Toplam Ücret</p>
                          <p className="text-sm font-semibold">{(selectedRequest.overtime_request.total_pay || 0).toLocaleString('tr-TR')} TL</p>
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

              {/* Onay Geçmişi - Accordion */}
              {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
                <Accordion type="single" collapsible className="mt-4">
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

              {/* PDF İndirme Butonu - Sadece onaylanmış talepler için */}
              {selectedRequest.status === "APPROVED" && (
                <div className="border-t pt-4 mt-6">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleDownloadPDF(selectedRequest.id)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    PDF İndir
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

