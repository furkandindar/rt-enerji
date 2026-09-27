"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileCheck,
  RotateCcw,
} from "lucide-react";

import { RequestStatusBadge } from "@/components/approvals/status-badge";
import { getRequestSummary } from "@/components/approvals/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PendingApproval } from "@/lib/approvals/types";
import type { DashboardRecentRequest, DashboardSummary } from "@/lib/dashboard/types";
import { formatTrDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

import { CountBadge, WidgetHeader } from "./widget-header";

// Onaya gelişinden bu yana bu kadar gün geçen kayıt vurgulanır.
const STALE_AFTER_DAYS = 3;

// Dar kolona sığan kısa göreli zaman: "az önce", "35 dk", "3 sa", "5 gün".
function shortAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün`;
  return `${Math.floor(days / 30)} ay`;
}

function AllLink({ href, label = "Tümü" }: { href: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs text-muted-foreground">
      <Link href={href}>
        {label}
        <ArrowRight className="size-3.5" />
      </Link>
    </Button>
  );
}

interface WorkOverviewProps {
  pendingClassName?: string;
  requestsClassName?: string;
}

// Bekleyen Onaylar + Taleplerim kartları tek istekten beslenir. Fragment döner:
// iki kart da sayfa grid'inin doğrudan elemanı olsun (yerleşim page.tsx'te).
export function WorkOverview({ pendingClassName, requestsClassName }: WorkOverviewProps) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const res = await fetch("/api/dashboard/workflow-summary", { signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Hata: ${res.status}`);
      setData(body as DashboardSummary);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Özet yüklenemedi");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (error) {
    return (
      <Card className={cn("flex items-center gap-3 px-4 py-3", pendingClassName)}>
        <AlertCircle className="size-4 shrink-0 text-destructive" />
        <p className="flex-1 text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Tekrar dene
        </Button>
      </Card>
    );
  }

  return (
    <>
      <PendingApprovalsCard data={data} className={pendingClassName} />
      <MyRequestsCard data={data} className={requestsClassName} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bekleyen onaylar
// ---------------------------------------------------------------------------

function PendingApprovalsCard({ data, className }: { data: DashboardSummary | null; className?: string }) {
  if (!data) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <WidgetHeader icon={FileCheck} title="Bekleyen Onaylar" />
        <ListSkeleton rows={3} />
      </Card>
    );
  }

  const { total, items } = data.pendingApprovals;

  // Boş durum tek satıra iner — onaycı olmayan çalışanın ekranında yer kaplamasın.
  if (total === 0) {
    return (
      <Card className={cn("flex items-center gap-2.5 px-4 py-3", className)}>
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        <p className="min-w-0 flex-1 truncate text-sm">Bekleyen onayınız yok</p>
        <div className="-mr-2">
          <AllLink href="/approvals/history" label="Geçmiş" />
        </div>
      </Card>
    );
  }

  const remaining = total - items.length;

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <WidgetHeader
        icon={FileCheck}
        title="Bekleyen Onaylar"
        badge={<CountBadge value={total} />}
        action={<AllLink href="/approvals" />}
      />
      <ul>
        {items.map((approval) => (
          <li key={approval.id} className="border-b last:border-b-0">
            <PendingRow approval={approval} viewerEmployeeId={data.viewerEmployeeId} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <Link
          href="/approvals"
          className="mt-auto flex items-center justify-center gap-1 border-t px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {remaining} talep daha
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </Card>
  );
}

function PendingRow({
  approval,
  viewerEmployeeId,
}: {
  approval: PendingApproval;
  viewerEmployeeId: string;
}) {
  const { request } = approval;
  const requester = request.requester;
  const requesterName = requester ? `${requester.first_name} ${requester.last_name}` : "-";
  const initials = requester
    ? `${requester.first_name.charAt(0)}${requester.last_name.charAt(0)}`.toLocaleUpperCase("tr-TR")
    : "?";
  const summary = getRequestSummary(request);
  const isDelegated =
    !!approval.approver_employee_id && approval.approver_employee_id !== viewerEmployeeId;
  const queuedAt = approval.queued_at ?? null;
  const isStale =
    queuedAt != null && differenceInCalendarDays(new Date(), new Date(queuedAt)) >= STALE_AFTER_DAYS;

  return (
    <Link
      href={`/approvals/${approval.id}`}
      className="flex items-center gap-3 px-4 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">
            {request.workflow_definition?.name ?? "Talep"}
          </p>
          {isDelegated && (
            <span
              className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground"
              title="Bu onay size vekaleten düşüyor"
            >
              Vekaleten
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {requesterName}
          {summary && summary !== "-" ? ` · ${summary}` : ""}
        </p>
      </div>
      {queuedAt && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs tabular-nums",
            isStale ? "font-medium text-orange-600 dark:text-orange-400" : "text-muted-foreground"
          )}
          title={`Onayınıza geliş: ${formatTrDateTime(queuedAt)}`}
        >
          {isStale && <Clock className="size-3" aria-label={`${STALE_AFTER_DAYS}+ gündür bekliyor`} />}
          {shortAgo(queuedAt)}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Taleplerim
// ---------------------------------------------------------------------------

const REQUEST_STATS: {
  key: keyof DashboardSummary["myRequests"]["counts"];
  label: string;
  dot: string;
}[] = [
  { key: "inProgress", label: "Süreçte", dot: "bg-yellow-500" },
  { key: "revision", label: "Revize", dot: "bg-orange-500" },
  { key: "approved", label: "Onaylı", dot: "bg-green-500" },
  { key: "rejected", label: "Red", dot: "bg-red-500" },
];

function MyRequestsCard({ data, className }: { data: DashboardSummary | null; className?: string }) {
  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <WidgetHeader
        icon={ClipboardList}
        title="Taleplerim"
        action={<AllLink href="/my-requests" />}
      />

      {!data ? (
        <ListSkeleton rows={2} />
      ) : (
        <>
          <dl className="grid grid-cols-4 divide-x border-b">
            {REQUEST_STATS.map((stat) => (
              <div key={stat.key} className="flex min-w-0 flex-col-reverse px-3 py-2">
                <dt className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", stat.dot)} />
                  {stat.label}
                </dt>
                <dd className="text-base font-semibold tabular-nums">
                  {data.myRequests.counts[stat.key]}
                </dd>
              </div>
            ))}
          </dl>

          {data.myRequests.counts.revision > 0 && (
            <Link
              href="/my-requests?status=REVISION_REQUESTED"
              className="flex items-center gap-2 border-b bg-orange-50 px-4 py-2 text-xs transition-colors hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
            >
              <RotateCcw className="size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {data.myRequests.counts.revision} talebiniz için revize istendi
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          )}

          {data.myRequests.recent.length === 0 ? (
            <p className="px-4 py-4 text-center text-sm text-muted-foreground">
              Henüz talep oluşturmadınız.
            </p>
          ) : (
            <ul>
              {data.myRequests.recent.map((request) => (
                <li key={request.id} className="border-b last:border-b-0">
                  <RecentRequestRow request={request} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function RecentRequestRow({ request }: { request: DashboardRecentRequest }) {
  const changedAt = request.updated_at ?? request.created_at;

  return (
    <Link
      href={`/my-requests/${request.id}`}
      className="flex items-center gap-3 px-4 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {request.workflow_definition?.name ?? "Talep"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{request.request_no ?? "—"}</span>
          <span title={formatTrDateTime(changedAt)}> · {shortAgo(changedAt)}</span>
        </p>
      </div>
      <RequestStatusBadge
        status={request.status}
        workflowCode={request.workflow_definition?.code}
        className="shrink-0 whitespace-nowrap px-2 text-[11px]"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
