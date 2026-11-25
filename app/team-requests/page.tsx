"use client";

// /team-requests — "Birimimin Talepleri": birim kapsamı olan kişi (access.is_unit_manager) —
// Müdür (aktif birim amiri: birimi + alt birimleri, salt okunur) veya requests.view_unit
// (Yönetici: yalnız kendi birimi; talep ekranındaki müdahale düğmeleri izne göre çıkar).
// Kapsam ve yetki sunucuda: GET /api/team-requests → public.unit_manager_requests().

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Eye, Filter, Info } from "lucide-react";

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
import { PaginationControls, normalizePageSize } from "@/components/ui/pagination-controls";
import { RequestStatusBadge } from "@/components/approvals/status-badge";
import { useUser } from "@/lib/contexts/user-context";

interface TeamRequestRow {
  id: string;
  request_no: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  workflow_definition: { id: string; code: string; name: string } | null;
  requester: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface WorkflowOption {
  id: string;
  code: string;
  name: string;
}

export default function TeamRequestsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TeamRequestsPageInner />
    </Suspense>
  );
}

function TeamRequestsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { loading: userLoading, isUnitManager } = useUser();

  const [requests, setRequests] = useState<TeamRequestRow[]>([]);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowOption[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (value === null || value === "" || value === "all") params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handlePageChange = useCallback(
    (page: number) => updateParams({ page: page > 1 ? page.toString() : null }),
    [updateParams]
  );

  useEffect(() => {
    if (userLoading || !isUnitManager) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (workflowFilter !== "all") params.append("workflow_code", workflowFilter);
        if (statusFilter !== "all") params.append("status", statusFilter);
        params.append("page", currentPage.toString());
        params.append("page_size", pageSize.toString());
        const res = await fetch(`/api/team-requests?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Talepler alınamadı");
          setRequests([]);
          setTotal(0);
          return;
        }
        setRequests(data.requests ?? []);
        setWorkflowDefinitions(data.workflowDefinitions ?? []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      } catch {
        if (!cancelled) setError("Talepler alınamadı");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userLoading, isUnitManager, workflowFilter, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    if (!isLoading && currentPage > totalPages) handlePageChange(totalPages);
  }, [isLoading, currentPage, totalPages, handlePageChange]);

  if (userLoading) return <Loading />;

  if (!isUnitManager) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground">
          Bu liste birim amirlerine ve birim taleplerini görme yetkisi olanlara açıktır.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Birimimin Talepleri</h1>
          <p className="text-muted-foreground">
            Biriminizdeki çalışanların talepleri (birim amirleri alt birimleri de görür)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={workflowFilter}
            onValueChange={(v) => updateParams({ workflow_code: v, page: null })}
          >
            <SelectTrigger className="w-[200px]">
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
          <Select
            value={statusFilter}
            onValueChange={(v) => updateParams({ status: v, page: null })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
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

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Birim amiri olduğunuz için bu talepleri görüntüleyebilirsiniz. Taslaklar, maaş avansı ve
          İK onay formları bu listede yer almaz. Onay vermeniz gereken talepler Bekleyen Onaylar&apos;dadır.
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border">
          <p className="text-destructive">{error}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border">
          <p className="text-muted-foreground">
            {workflowFilter !== "all" || statusFilter !== "all"
              ? "Filtrelere uygun talep bulunamadı"
              : "Biriminizde görüntülenecek talep yok"}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Talep No</TableHead>
                  <TableHead>Çalışan</TableHead>
                  <TableHead>Talep Tipi</TableHead>
                  <TableHead>Oluşturulma</TableHead>
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
                      {request.requester
                        ? `${request.requester.first_name ?? ""} ${request.requester.last_name ?? ""}`.trim()
                        : "-"}
                    </TableCell>
                    <TableCell>{request.workflow_definition?.name || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge
                        status={request.status}
                        workflowCode={request.workflow_definition?.code}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/requests/${request.id}`)}
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
            onPageSizeChange={(v) => updateParams({ page_size: v, page: null })}
          />
        </>
      )}
    </div>
  );
}
