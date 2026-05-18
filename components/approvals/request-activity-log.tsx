"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  FilePlus2,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  RefreshCw,
  CircleCheckBig,
  Undo2,
  Ban,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Bu component'in iki sayfada da kullanılması için minimum bağımlılıkla
// yazıldı. my-requests Approval ve approvals Approval tipleri yapısal
// olarak uyumlu — buraya structural bir tip alıyoruz.
export interface ActivityApproval {
  id: string;
  status: string;
  comment?: string | null;
  decided_at?: string | null;
  created_at: string;
  sequence_order?: number;
  revision_cycle?: number | null;
  workflow_step?: {
    name?: string;
    approver_type?: string;
    phase?: string;
    form_section_key?: string | null;
  } | null;
  approver?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

export interface ActivityRequest {
  created_at: string;
  submitted_at?: string | null;
  completed_at?: string | null;
  last_action?: string | null;
  last_action_at?: string | null;
  requester?: { first_name?: string | null; last_name?: string | null } | null;
  all_approvals?: ActivityApproval[];
}

type ActivityKind =
  | "created"
  | "submitted"
  | "resubmitted"
  | "decision"
  | "last_action"
  | "completed";

interface ActivityEvent {
  key: string;
  at: string;
  title: string;
  actor?: string;
  comment?: string;
  icon: LucideIcon;
  iconClass: string;
  kind: ActivityKind;
}

function getApproverName(a: ActivityApproval): string {
  const step = a.workflow_step;
  if (step?.phase === "COMPLETION" && step?.form_section_key === "ykb_signed_pdf") {
    return "RAMAZAN TAŞ";
  }
  const first = a.approver?.first_name ?? "";
  const last = a.approver?.last_name ?? "";
  const name = `${first} ${last}`.trim();
  return name || "Bilinmiyor";
}

function getRequesterName(req: ActivityRequest): string {
  const r = req.requester;
  const name = `${r?.first_name ?? ""} ${r?.last_name ?? ""}`.trim();
  return name || "Talep Sahibi";
}

const DECISION_LABEL: Record<string, string> = {
  APPROVED: "onayladı",
  REJECTED: "reddetti",
  REVISION_REQUESTED: "revize istedi",
};

const DECISION_ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  APPROVED: { icon: CheckCircle2, cls: "text-green-600" },
  REJECTED: { icon: XCircle, cls: "text-red-600" },
  REVISION_REQUESTED: { icon: RotateCcw, cls: "text-orange-600" },
};

const LAST_ACTION_LABEL: Record<string, string> = {
  WITHDRAWN: "Talep geri çekildi",
  CANCELLED: "Talep iptal edildi",
  EDITED: "Talep düzenlendi",
  EDITED_BY_ADMIN: "Talep yönetici tarafından düzenlendi",
};

const LAST_ACTION_ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  WITHDRAWN: { icon: Undo2, cls: "text-muted-foreground" },
  CANCELLED: { icon: Ban, cls: "text-red-600" },
  EDITED: { icon: Pencil, cls: "text-muted-foreground" },
  EDITED_BY_ADMIN: { icon: Pencil, cls: "text-muted-foreground" },
};

function buildEvents(req: ActivityRequest): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const requesterName = getRequesterName(req);

  // 1. Talep oluşturuldu
  events.push({
    key: "created",
    at: req.created_at,
    title: "Talep oluşturuldu",
    actor: requesterName,
    icon: FilePlus2,
    iconClass: "text-muted-foreground",
    kind: "created",
  });

  const approvals = req.all_approvals ?? [];

  // 2. Cycle başlangıçları:
  //    - cycle 0 → "Onaya gönderildi" (submitted_at varsa onu kullan, yoksa
  //      cycle 0'ın en küçük created_at'i)
  //    - cycle > 0 → "Revize edilip yeniden gönderildi" (cycle'ın en küçük
  //      created_at'i)
  const cycles = Array.from(
    new Set(approvals.map((a) => a.revision_cycle ?? 0))
  );
  for (const cycle of cycles) {
    const cycleApprovals = approvals.filter(
      (a) => (a.revision_cycle ?? 0) === cycle
    );
    if (cycleApprovals.length === 0) continue;
    const minCreatedAt = cycleApprovals.reduce(
      (min, a) => (min === "" || a.created_at < min ? a.created_at : min),
      ""
    );

    if (cycle === 0) {
      const at = req.submitted_at || minCreatedAt;
      events.push({
        key: `submitted-${cycle}`,
        at,
        title: "Onaya gönderildi",
        actor: requesterName,
        icon: Send,
        iconClass: "text-blue-600",
        kind: "submitted",
      });
    } else {
      events.push({
        key: `resubmitted-${cycle}`,
        at: minCreatedAt,
        title: `Revize edilip yeniden gönderildi (Tur ${cycle + 1})`,
        actor: requesterName,
        icon: RefreshCw,
        iconClass: "text-blue-600",
        kind: "resubmitted",
      });
    }
  }

  // 3. Decisions: decided_at varsa gerçek karar say. Sadece sequence 1'deki
  // REQUESTER auto-approve'u atla — onu zaten "Onaya gönderildi" temsil ediyor.
  // Sonraki adımlardaki REQUESTER kararları (örn. çok-adımlı formda talep
  // sahibinin manuel doldurup imzaladığı adım) gösterilsin.
  for (const a of approvals) {
    if (!a.decided_at) continue;
    if (
      a.workflow_step?.approver_type === "REQUESTER" &&
      (a.sequence_order ?? 0) === 1
    ) {
      continue;
    }
    if (!DECISION_LABEL[a.status]) continue;

    const icon = DECISION_ICON[a.status];
    events.push({
      key: `decision-${a.id}`,
      at: a.decided_at,
      title: `${getApproverName(a)} ${DECISION_LABEL[a.status]}`,
      actor: a.workflow_step?.name ?? undefined,
      comment: a.comment || undefined,
      icon: icon.icon,
      iconClass: icon.cls,
      kind: "decision",
    });
  }

  // 4. Son lifecycle aksiyonu (sadece kullanıcı/admin tarafından yapılanlar
  //    — REVISION_REQUESTED ve RESUBMITTED zaten approval kayıtlarından
  //    geliyor, duplicate olmasın).
  if (req.last_action && req.last_action_at) {
    const label = LAST_ACTION_LABEL[req.last_action];
    const icon = LAST_ACTION_ICON[req.last_action];
    if (label && icon) {
      events.push({
        key: `last-${req.last_action}`,
        at: req.last_action_at,
        title: label,
        icon: icon.icon,
        iconClass: icon.cls,
        kind: "last_action",
      });
    }
  }

  // 5. Tamamlandı
  if (req.completed_at) {
    events.push({
      key: "completed",
      at: req.completed_at,
      title: "Talep tamamlandı",
      icon: CircleCheckBig,
      iconClass: "text-green-700",
      kind: "completed",
    });
  }

  // En yeni üstte
  events.sort((a, b) => b.at.localeCompare(a.at));

  return events;
}

interface RequestActivityLogProps {
  request: ActivityRequest;
}

export function RequestActivityLog({ request }: RequestActivityLogProps) {
  const events = useMemo(() => buildEvents(request), [request]);

  if (events.length === 0) return null;

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="activity-log"
      className="mt-4"
    >
      <AccordionItem value="activity-log">
        <AccordionTrigger className="text-sm font-medium">
          Süreç Logu ({events.length})
        </AccordionTrigger>
        <AccordionContent>
          <ol className="space-y-3 pl-1">
            {events.map((ev) => {
              const Icon = ev.icon;
              return (
                <li key={ev.key} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-muted p-1.5">
                    <Icon className={`h-4 w-4 ${ev.iconClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm font-medium">{ev.title}</p>
                      {ev.actor && (
                        <span className="text-xs text-muted-foreground">
                          · {ev.actor}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.at), "d MMM yyyy HH:mm", {
                        locale: tr,
                      })}
                    </p>
                    {ev.comment && (
                      <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-sm whitespace-pre-wrap">
                        {ev.comment}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
