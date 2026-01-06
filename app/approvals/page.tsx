"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Eye, Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
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

interface PendingApproval {
  id: string;
  status: string;
  decided_at: string | null;
  workflow_step: {
    name: string;
    step_order: number;
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
    leave_request: {
      leave_type: string;
      start_datetime: string;
      end_datetime: string;
      total_days: number;
      reason: string | null;
    };
    approvals?: Approval[];
  };
}

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
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

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination states for approval history
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
  }, []);

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

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/approvals/${selectedApproval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "İşlem başarısız");
      }

      toast.success(decision === "APPROVED" ? "Talep onaylandı" : "Talep reddedildi");
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
        <SheetContent className="overflow-y-auto sm:max-w-[550px]">
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
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sicil No</p>
                  <p className="text-sm font-semibold">
                    {selectedApproval.request.requester?.employee_no || "-"}
                  </p>
                </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="comment">Yorum (Red için zorunlu)</Label>
                    <Input
                      id="comment"
                      placeholder="Yorumunuzu buraya yazın..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleDecision("APPROVED")}
                      disabled={isSubmitting}
                    >
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Onayla
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

