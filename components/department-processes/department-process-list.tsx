"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Eye, Filter, Plus, ShieldAlert } from "lucide-react";

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
import { useUser } from "@/lib/contexts/user-context";

export type DepartmentProcessListConfig = {
  workflowCode: string;
  pageTitle: string;
  pageDescription: string;
  newButtonLabel: string;
  newRoute: string;
  apiPath: string;
  /**
   * Tablo kolonlarını süreç bazında özelleştirme. Belirtilmezse varsayılan
   * kolonlar: Talep No / Talep Sahibi / Oluşturulma / Güncellenme / Durum / İşlemler.
   */
  columns?: {
    /** Talep Sahibi kolonu (default: true) */
    requester?: boolean;
    /** Talep Sahibi kolonunun başlığı (default: "Talep Sahibi"; departman belgelerinde ör. "Hazırlayan") */
    requesterHeader?: string;
    /** Güncellenme kolonu (default: true) */
    updatedAt?: boolean;
    /**
     * Talep No'dan hemen sonra gelen ek kolon (ör. onay kapaklarında "Sayı").
     * `path` API satırında nokta ile ayrılmış alan yolu (ör. "finance_request.document_no").
     * Fonksiyon değil string: sayfa Server Component olduğundan config serileştirilebilir olmalı.
     */
    documentNo?: {
      header: string;
      path: string;
    };
  };
};

/** "a.b.c" yolunu nesne üzerinde yürütür; ara değer yoksa null döner. */
function readPath(obj: unknown, path: string): string | null {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur === null || cur === undefined ? null : String(cur);
}

type DepartmentRequest = {
  id: string;
  request_no: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  workflow_definition: { id: string; code: string; name: string } | null;
  requester: {
    id: string;
    first_name: string;
    last_name: string;
    employee_no: string | null;
  } | null;
  /** Tipe özgü ilişkiler (finance_request, accounting_request, ...) — API `*` ile döner */
  [key: string]: unknown;
};

export function DepartmentProcessListPage(props: { config: DepartmentProcessListConfig }) {
  return (
    <Suspense fallback={<Loading />}>
      <DepartmentProcessListInner config={props.config} />
    </Suspense>
  );
}

function DepartmentProcessListInner({ config }: { config: DepartmentProcessListConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUser();

  const [requests, setRequests] = useState<DepartmentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const statusFilter = searchParams.get("status") || "all";
  const pageSize = normalizePageSize(searchParams.get("page_size"));
  const pageParam = Number(searchParams.get("page"));
  const currentPage = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const hasAccess = !!user && user.availableWorkflowCodes.includes(config.workflowCode);
  const showRequester = config.columns?.requester ?? true;
  const requesterHeader = config.columns?.requesterHeader ?? "Talep Sahibi";
  const showUpdatedAt = config.columns?.updatedAt ?? true;
  const documentNoColumn = config.columns?.documentNo;

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

  const fetchRequests = useCallback(async () => {
    if (!hasAccess) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append("scope", "department");
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      params.append("page", currentPage.toString());
      params.append("page_size", pageSize.toString());

      const response = await fetch(`${config.apiPath}?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.items ?? []);
        setTotal(typeof data.total === "number" ? data.total : (data.items?.length ?? 0));
      } else {
        setRequests([]);
        setTotal(0);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
      setRequests([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [hasAccess, statusFilter, currentPage, pageSize, config.apiPath]);

  useEffect(() => {
    if (userLoading) return;
    fetchRequests();
  }, [userLoading, fetchRequests]);

  useEffect(() => {
    if (!isLoading && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [isLoading, currentPage, totalPages, handlePageChange]);

  if (userLoading) {
    return <Loading />;
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Erişim yetkiniz yok</h1>
        <p className="text-muted-foreground max-w-md">
          Bu sayfayı görüntüleyebilmek için ilgili departmanın süreç başlatma yetkisine sahip olmanız gerekir.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{config.pageTitle}</h1>
          <p className="text-muted-foreground">{config.pageDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
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
          <Button onClick={() => router.push(config.newRoute)}>
            <Plus className="h-4 w-4" />
            {config.newButtonLabel}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <p className="text-muted-foreground">
            {statusFilter !== "all"
              ? "Filtreye uygun talep bulunamadı"
              : "Henüz süreç bulunmuyor"}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Talep No</TableHead>
                  {documentNoColumn && <TableHead>{documentNoColumn.header}</TableHead>}
                  {showRequester && <TableHead>{requesterHeader}</TableHead>}
                  <TableHead>Oluşturulma</TableHead>
                  {showUpdatedAt && <TableHead>Güncellenme</TableHead>}
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
                    {documentNoColumn && (
                      <TableCell className="font-medium">
                        {readPath(request, documentNoColumn.path) || "-"}
                      </TableCell>
                    )}
                    {showRequester && (
                    <TableCell className="font-medium">
                      {request.requester ? (
                        <div className="flex flex-col">
                          <span>
                            {request.requester.first_name} {request.requester.last_name}
                          </span>
                          {request.requester.employee_no && (
                            <span className="text-xs text-muted-foreground">
                              {request.requester.employee_no}
                            </span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                    </TableCell>
                    {showUpdatedAt && (
                      <TableCell className="text-muted-foreground">
                        {request.updated_at
                          ? format(new Date(request.updated_at), "d MMM yyyy HH:mm", { locale: tr })
                          : "-"}
                      </TableCell>
                    )}
                    <TableCell>
                      <RequestStatusBadge status={request.status} workflowCode={request.workflow_definition?.code} />
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
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}
    </div>
  );
}
