"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Eye, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PaginationControls,
  normalizePageSize,
} from "@/components/ui/pagination-controls";
import { RequestStatusBadge } from "@/components/approvals/status-badge";
import type {
  Request,
  WorkflowDefinition,
} from "@/components/my-requests/request-detail-content";

// Next.js 16: useSearchParams kullanan client component kendi Suspense boundary'sinde olmalı.
export default function MyRequestsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MyRequestsPageInner />
    </Suspense>
  );
}

function MyRequestsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [requests, setRequests] = useState<Request[]>([]);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // V5: Filtreler URL query'sinden okunur, değişimde URL'e geri yazılır.
  // Detaydan back ile dönünce filtre korunur, link paylaşılabilir.
  const workflowFilter = searchParams.get("workflow_code") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const pageSize = normalizePageSize(searchParams.get("page_size"));
  const pageParam = Number(searchParams.get("page"));
  const currentPage = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "all") {
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

  const setWorkflowFilter = useCallback(
    (value: string) => updateParams({ workflow_code: value, page: null }),
    [updateParams]
  );
  const setStatusFilter = useCallback(
    (value: string) => updateParams({ status: value, page: null }),
    [updateParams]
  );
  const handlePageChange = useCallback(
    (page: number) => updateParams({ page: page > 1 ? page.toString() : null }),
    [updateParams]
  );
  const handlePageSizeChange = useCallback(
    (value: string) => updateParams({ page_size: value, page: null }),
    [updateParams]
  );

  useEffect(() => {
    fetchRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowFilter, statusFilter, currentPage, pageSize]);

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
      params.append("page", currentPage.toString());
      params.append("page_size", pageSize.toString());

      const response = await fetch(`/api/my-requests?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests);
        setWorkflowDefinitions(data.workflowDefinitions);
        setTotal(typeof data.total === "number" ? data.total : data.requests.length);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Page out-of-range guard: filtre değişimi ya da kayıt silinmesi sonrası
  // mevcut sayfa son sayfayı geçtiyse son sayfaya in.
  useEffect(() => {
    if (!isLoading && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [isLoading, currentPage, totalPages, handlePageChange]);

  const handleViewDetail = (request: Request) => {
    router.push(`/my-requests/${request.id}`);
  };


  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taleplerim</h1>
          <p className="text-muted-foreground">
            Oluşturduğunuz tüm talepleri görüntüleyin
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
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
              <SelectItem value="DRAFT">Taslak</SelectItem>
              <SelectItem value="PENDING">Beklemede</SelectItem>
              <SelectItem value="REVISION_REQUESTED">Revize İstendi</SelectItem>
              <SelectItem value="APPROVED">Onaylandı</SelectItem>
              <SelectItem value="AWAITING_COMPLETION">RT Onayı / Görev Dönüşü</SelectItem>
              <SelectItem value="COMPLETED">Tamamlandı</SelectItem>
              <SelectItem value="REJECTED">Reddedildi</SelectItem>
              <SelectItem value="CANCELLED">İptal Edildi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <p className="text-muted-foreground">
            {workflowFilter !== "all" || statusFilter !== "all"
              ? "Filtrelere uygun talep bulunamadı"
              : "Henüz talebiniz yok"}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Talep No</TableHead>
                  <TableHead>Talep Tipi</TableHead>
                  <TableHead>Oluşturulma</TableHead>
                  <TableHead>Güncellenme</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-[70px]">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {request.request_no || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {request.workflow_definition?.name || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {request.updated_at
                        ? format(new Date(request.updated_at), "d MMM yyyy HH:mm", { locale: tr })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={request.status} workflowCode={request.workflow_definition?.code} />
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

          <PaginationControls
            totalCount={total}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

    </div>
  );
}
