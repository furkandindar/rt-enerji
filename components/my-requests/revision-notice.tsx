"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageSquareReply, MessageSquareWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getApproverDisplayName, type Approver, type WorkflowStep } from "@/lib/approvals/types";
import { formatTrDateTime } from "@/lib/timezone";
import { findRevisionExchange } from "@/lib/workflow/revision-response";

// Revize bandı: talep REVISION_REQUESTED iken talep sahibine kimin, hangi
// adımda, ne zaman ve hangi açıklamayla revize istediğini gösterir.
// Detay ekranında (onaylar zaten yüklü) RevisionNotice, düzenleme formunda
// (yalnız requestId var) RevisionNoticeForRequest kullanılır.

export interface RevisionNoticeApproval {
  status: string;
  comment: string | null;
  decided_at: string | null;
  workflow_step: WorkflowStep;
  approver: Approver;
  acted_by?: Approver | null;
}

/** Aktif cycle onaylarından en son verilen revize kararını bulur. */
function findLatestRevision(approvals: RevisionNoticeApproval[]): RevisionNoticeApproval | null {
  const revisions = approvals.filter((a) => a.status === "REVISION_REQUESTED");
  if (revisions.length === 0) return null;
  return revisions.reduce((latest, a) =>
    (a.decided_at ?? "") > (latest.decided_at ?? "") ? a : latest
  );
}

interface RevisionNoticeProps {
  /** Aktif revize cycle'ının onay kayıtları. */
  approvals: RevisionNoticeApproval[];
  /** Bandın sağında gösterilecek aksiyon (ör. "Düzenle" butonu). */
  action?: ReactNode;
}

export function RevisionNotice({ approvals, action }: RevisionNoticeProps) {
  const revision = findLatestRevision(approvals);
  if (!revision) return null;

  return (
    <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Revize istendi
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {getApproverDisplayName(revision)}
              {revision.workflow_step?.name ? ` · ${revision.workflow_step.name}` : ""}
              {revision.decided_at ? ` · ${formatTrDateTime(revision.decided_at)}` : ""}
            </p>
            {revision.comment && (
              <p className="whitespace-pre-wrap break-words pt-1 text-sm text-amber-950 dark:text-amber-50">
                {revision.comment}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export interface RevisionExchangeApproval extends RevisionNoticeApproval {
  sequence_order?: number;
  revision_cycle?: number | null;
}

interface RevisionResponseNoticeProps {
  /** Tüm cycle'ların onay kayıtları (detay uçlarındaki all_approvals). */
  allApprovals: RevisionExchangeApproval[];
  currentCycle: number | null | undefined;
}

/**
 * Revize yazışması bandı: talep revize sonrası yeniden gönderildiyse onaycı
 * ekranında önceki turun revize notunu ve talep sahibinin Revize Açıklaması'nı
 * birlikte gösterir. Talep sahibi açıklama yazmadıysa hiçbir şey göstermez.
 */
export function RevisionResponseNotice({ allApprovals, currentCycle }: RevisionResponseNoticeProps) {
  const { revision, response } = findRevisionExchange(allApprovals, currentCycle ?? 0);
  if (!response) return null;

  return (
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/50">
      <div className="flex gap-3">
        <MessageSquareReply className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            Revize sonrası yeniden gönderildi
          </p>
          {revision && (
            <div className="space-y-1">
              <p className="text-xs text-sky-800 dark:text-sky-200">
                <span className="font-medium">Revize talebi</span>
                {` · ${getApproverDisplayName(revision)}`}
                {revision.decided_at ? ` · ${formatTrDateTime(revision.decided_at)}` : ""}
              </p>
              {revision.comment && (
                <p className="whitespace-pre-wrap wrap-break-word text-sm text-sky-950 dark:text-sky-50">
                  {revision.comment}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-sky-800 dark:text-sky-200">
              <span className="font-medium">Talep sahibinin açıklaması</span>
              {` · ${getApproverDisplayName(response)}`}
              {response.decided_at ? ` · ${formatTrDateTime(response.decided_at)}` : ""}
            </p>
            <p className="whitespace-pre-wrap wrap-break-word text-sm text-sky-950 dark:text-sky-50">
              {response.comment}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Düzenleme formları için: talebin aktif cycle'ındaki revize kaydını kendisi
 * çeker. Talep revizede değilse (ör. DRAFT) hiçbir şey göstermez.
 */
export function RevisionNoticeForRequest({ requestId }: { requestId: string | null }) {
  const [approvals, setApprovals] = useState<RevisionNoticeApproval[]>([]);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: req } = await supabase
        .from("requests")
        .select("status, current_revision_cycle")
        .eq("id", requestId)
        .single();
      if (!req || req.status !== "REVISION_REQUESTED") return;

      const { data } = await supabase
        .from("request_approvals")
        .select(`
          status,
          comment,
          decided_at,
          workflow_step:workflow_steps(step_order, name, approver_type, phase, form_section_key),
          approver:employees!approver_employee_id(id, first_name, last_name),
          acted_by:employees!acted_by_employee_id(id, first_name, last_name)
        `)
        .eq("request_id", requestId)
        .eq("revision_cycle", req.current_revision_cycle ?? 0)
        .eq("status", "REVISION_REQUESTED");

      if (!cancelled && data) {
        setApprovals(data as unknown as RevisionNoticeApproval[]);
      }
    })().catch((err) => console.error("[RevisionNotice] load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  return <RevisionNotice approvals={approvals} />;
}
