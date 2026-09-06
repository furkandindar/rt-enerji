"use client";

// Süreç Tanımları — admin, salt okunur (Faz 1).
// Sol: süreç listesi (+ Birim Amirleri). Sağ: seçili sürecin adımları ve onaycıları.
// Veri sunucuda derlenir (lib/workflow/config-overview.ts); burada yalnız gösterim var.

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  CircleAlert,
  Eye,
  Info,
  Lock,
  Paperclip,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTrDateTime } from "@/lib/timezone";
import type { ActionType, ApproverType, WorkflowStepPhase } from "@/lib/workflow/types";
import type {
  ConfigHolder,
  ConfigPosition,
  ConfigStep,
  ConfigWarning,
  ConfigWorkflow,
  UnitHeadEntry,
  WorkflowConfigOverview,
} from "@/lib/workflow/config-overview";

// ============================================================================
// Etiketler
// ============================================================================

const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  REQUESTER: "Talep Eden",
  UNIT_HEAD: "Birim Amiri",
  STATIC_POSITION: "Sabit Pozisyon",
  DYNAMIC_USER_LIST: "Dinamik Liste",
};

const APPROVER_TYPE_BADGE: Record<ApproverType, "default" | "secondary" | "outline" | "warning"> = {
  REQUESTER: "secondary",
  UNIT_HEAD: "outline",
  STATIC_POSITION: "default",
  DYNAMIC_USER_LIST: "warning",
};

const APPROVER_TYPE_HELP: Record<ApproverType, string> = {
  REQUESTER: "Talebi oluşturan kişi. İlk adımda talep gönderimi onay sayılır (otomatik); tamamlama fazında formu talep eden doldurur.",
  UNIT_HEAD: "Talep edenin birimindeki amir pozisyonu (is_unit_head). Amir yoksa ya da talep eden amirin kendisiyse üst birime tırmanır; en tepede kendi kendini onaylar. Çözümlenen kişi ileride zaten onaycıysa bu adım hiç oluşmaz.",
  STATIC_POSITION: "Seçili pozisyondaki aktif çalışan. Pozisyonda tam bir aktif atama olmalı; yoksa ya da birden fazlaysa talep oluşturma hata verir.",
  DYNAMIC_USER_LIST: "Talep formunda seçilen kişiler; seçim sırasıyla tek tek onaylar. Kimse seçilmezse adım atlanır.",
};

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  FILL_AND_SIGN: "Doldur + İmzala",
  SIGN_ONLY: "Sadece İmza",
};

const PHASE_LABELS: Record<WorkflowStepPhase, string> = {
  APPROVAL: "Onay",
  COMPLETION: "Tamamlama",
};

const UNIT_HEADS_KEY = "__unit_heads__";

// ============================================================================
// Yardımcılar
// ============================================================================

function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function shortMime(mime: string): string {
  // "application/pdf" → "pdf", "image/jpeg" → "jpeg"
  const idx = mime.lastIndexOf("/");
  return idx >= 0 ? mime.slice(idx + 1) : mime;
}

function formatConditionValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === null || value === undefined) return "null";
  return String(value);
}

function countWarnings(items: ConfigWarning[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const w of items) {
    if (w.level === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

function workflowWarnings(wf: ConfigWorkflow): ConfigWarning[] {
  return [...wf.warnings, ...wf.steps.flatMap((s) => s.warnings)];
}

// ============================================================================
// Küçük parçalar
// ============================================================================

function WarningList({ items, className }: { items: ConfigWarning[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {items.map((w, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs",
            w.level === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          )}
        >
          {w.level === "error" ? (
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}

function WarningCountBadge({ items }: { items: ConfigWarning[] }) {
  const { errors, warnings } = countWarnings(items);
  if (errors === 0 && warnings === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        errors > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      )}
      title={`${errors} hata, ${warnings} uyarı`}
    >
      {errors > 0 ? <CircleAlert className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
      {errors + warnings}
    </span>
  );
}

function HolderChip({ holder }: { holder: ConfigHolder }) {
  const inactive = holder.status !== "ACTIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
        inactive ? "border-destructive/40 text-destructive" : "bg-muted/50"
      )}
    >
      <Users className="h-3 w-3 shrink-0 opacity-70" />
      <span className="font-medium">{holder.full_name}</span>
      {!holder.is_primary && <span className="text-muted-foreground">(ikincil)</span>}
      {inactive && <span className="font-semibold">PASİF</span>}
    </span>
  );
}

function PositionSummary({ position }: { position: ConfigPosition }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{position.title}</span>
        {position.unit && (
          <span className="text-muted-foreground">· {position.unit.name}</span>
        )}
        {position.location && (
          <span className="text-muted-foreground">· {position.location}</span>
        )}
        {position.is_unit_head && (
          <Badge variant="outline" className="text-[10px]">
            Birim amiri
          </Badge>
        )}
        {!position.is_active && (
          <Badge variant="destructive" className="text-[10px]">
            Pasif pozisyon
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {position.holders.length === 0 ? (
          <span className="text-xs text-destructive">Aktif atama yok</span>
        ) : (
          position.holders.map((h) => <HolderChip key={h.employee_id} holder={h} />)
        )}
      </div>
    </div>
  );
}

function ApproverResolution({ step }: { step: ConfigStep }) {
  switch (step.approver_type) {
    case "REQUESTER":
      return (
        <p className="text-sm text-muted-foreground">
          {step.phase === "COMPLETION"
            ? "Talep eden kişi; tamamlama fazında bu adımı kendisi doldurur."
            : step.step_order === 1
              ? "Talep eden kişi; talebin gönderilmesi bu adımın onayı sayılır (otomatik)."
              : "Talep eden kişi."}
        </p>
      );
    case "UNIT_HEAD":
      return (
        <p className="text-sm text-muted-foreground">
          Talep edenin birim amiri. Amir yoksa ya da talep eden amirin kendisiyse üst birime tırmanır.
          Hangi birimde kimin amir olduğunu <span className="font-medium text-foreground">Birim Amirleri</span>{" "}
          görünümünden izleyebilirsiniz.
        </p>
      );
    case "DYNAMIC_USER_LIST":
      return (
        <p className="text-sm text-muted-foreground">
          Talep formunda seçilen kişiler; seçim sırasıyla tek tek onaylar. Kimse seçilmezse adım atlanır.
        </p>
      );
    case "STATIC_POSITION":
      if (!step.static_position) {
        return <p className="text-sm text-destructive">Pozisyon seçilmemiş.</p>;
      }
      return <PositionSummary position={step.static_position} />;
  }
}

function StepCard({ step, isLast }: { step: ConfigStep; isLast: boolean }) {
  const { errors } = countWarnings(step.warnings);
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Zaman çizgisi */}
      {!isLast && (
        <span className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden />
      )}
      <div
        className={cn(
          "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          errors > 0
            ? "border-destructive bg-destructive/10 text-destructive"
            : step.phase === "COMPLETION"
              ? "border-dashed bg-background"
              : "bg-background"
        )}
      >
        {step.step_order}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold leading-tight">{step.name}</h3>
              <Badge variant={APPROVER_TYPE_BADGE[step.approver_type]}>
                {APPROVER_TYPE_LABELS[step.approver_type]}
              </Badge>
              {step.phase === "COMPLETION" && (
                <Badge variant="outline">{PHASE_LABELS.COMPLETION} fazı</Badge>
              )}
              {step.condition && (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                  title="Koşul sağlanmazsa bu adım hiç oluşmaz"
                >
                  Koşullu: {step.condition.field} = {formatConditionValue(step.condition.value)}
                </Badge>
              )}
              {!step.is_required && <Badge variant="secondary">Opsiyonel</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {step.action_type ? ACTION_TYPE_LABELS[step.action_type] : "Doldur + İmzala (varsayılan)"}
              {step.form_section_key && (
                <>
                  {" · form bölümü "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{step.form_section_key}</code>
                </>
              )}
            </p>
          </div>
        </div>

        <ApproverResolution step={step} />

        {step.attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {step.attachments.map((a) => {
              const size = formatBytes(a.max_file_size_bytes);
              const mimes = a.allowed_mime_types?.map(shortMime).join(", ");
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-foreground">{a.label}</span>
                  <span>· {a.is_required ? "zorunlu" : "opsiyonel"}</span>
                  {a.max_files != null && <span>· en fazla {a.max_files} dosya</span>}
                  {size && <span>· {size}</span>}
                  {mimes && <span>· {mimes}</span>}
                </div>
              );
            })}
          </div>
        )}

        <WarningList items={step.warnings} />
      </div>
    </li>
  );
}

// ============================================================================
// Sağ panel: süreç detayı
// ============================================================================

function WorkflowDetail({ workflow }: { workflow: ConfigWorkflow }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{workflow.name}</h2>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{workflow.code}</code>
          {workflow.is_active ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="destructive">Pasif</Badge>
          )}
          {workflow.is_restricted ? (
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" /> Kısıtlı başlatma
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" /> Herkes başlatabilir
            </Badge>
          )}
        </div>
        {workflow.description && (
          <p className="text-sm text-muted-foreground">{workflow.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Oluşturma: {formatTrDateTime(workflow.created_at)}
          {workflow.updated_at && <> · Güncelleme: {formatTrDateTime(workflow.updated_at)}</>}
        </p>
        <WarningList items={workflow.warnings} />
      </div>

      {/* Başlatıcılar */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Kimler başlatabilir
        </h3>
        {!workflow.is_restricted ? (
          <p className="text-sm text-muted-foreground">
            Tüm çalışanlar. (Yöneticiler her süreci başlatabilir.)
          </p>
        ) : workflow.initiators.length === 0 ? (
          <p className="text-sm text-muted-foreground">Başlatıcı tanımı yok; yalnız yöneticiler.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {workflow.initiators.map((ini) => (
              <div key={ini.id} className="rounded-lg border p-3">
                {ini.position ? (
                  <PositionSummary position={ini.position} />
                ) : ini.unit ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{ini.unit.name}</span>
                    <span className="text-muted-foreground">· birimdeki tüm çalışanlar</span>
                  </div>
                ) : (
                  <p className="text-sm text-destructive">Pozisyon/birim referansı çözümlenemedi.</p>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Yöneticiler ayrıca her süreci başlatabilir.</p>
          </div>
        )}
      </section>

      {/* Adımlar */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Adımlar ({workflow.steps.length})
        </h3>
        {workflow.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Adım tanımlı değil.</p>
        ) : (
          <ol className="flex flex-col">
            {workflow.steps.map((step, idx) => (
              <StepCard key={step.id} step={step} isLast={idx === workflow.steps.length - 1} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Sağ panel: birim amirleri
// ============================================================================

function UnitHeadsView({ entries }: { entries: UnitHeadEntry[] }) {
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);
  const visible = showInactiveUnits ? entries : entries.filter((e) => e.unit.is_active);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Birim Amirleri</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Birim Amiri</span> tipindeki adımlar bu tabloya göre çözümlenir:
          talep edenin biriminde aktif amir pozisyonu ve o pozisyondaki kişi aranır; bulunamazsa üst birime tırmanır.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={showInactiveUnits}
          onChange={(e) => setShowInactiveUnits(e.target.checked)}
        />
        Pasif birimleri de göster
      </label>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Birim</TableHead>
              <TableHead>Üst birim</TableHead>
              <TableHead>Amir pozisyonu</TableHead>
              <TableHead>Amir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((entry) => {
              const activeHeads = entry.head_positions.filter((p) => p.is_active);
              return (
                <TableRow key={entry.unit.id}>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{entry.unit.name}</span>
                      {!entry.unit.is_active && (
                        <Badge variant="destructive" className="w-fit text-[10px]">
                          Pasif birim
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {entry.unit.parent?.name ?? <span className="italic">— (en üst)</span>}
                  </TableCell>
                  <TableCell className="align-top">
                    {activeHeads.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {activeHeads.map((p) => (
                          <span key={p.id}>{p.title}</span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-2">
                      {activeHeads.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        activeHeads.map((p) => (
                          <div key={p.id} className="flex flex-wrap gap-1.5">
                            {p.holders.length === 0 ? (
                              <span className="text-xs text-destructive">Aktif atama yok</span>
                            ) : (
                              p.holders.map((h) => <HolderChip key={h.employee_id} holder={h} />)
                            )}
                          </div>
                        ))
                      )}
                      <WarningList items={entry.warnings} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Gösterilecek birim yok.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================================================
// Ana bileşen
// ============================================================================

interface WorkflowConfigViewProps {
  overview: WorkflowConfigOverview;
}

export function WorkflowConfigView({ overview }: WorkflowConfigViewProps) {
  const [selectedKey, setSelectedKey] = useState<string>(
    overview.workflows[0]?.id ?? UNIT_HEADS_KEY
  );
  const [query, setQuery] = useState("");

  const filteredWorkflows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return overview.workflows;
    return overview.workflows.filter(
      (wf) =>
        wf.name.toLocaleLowerCase("tr").includes(q) ||
        wf.code.toLocaleLowerCase("tr").includes(q)
    );
  }, [overview.workflows, query]);

  const stats = useMemo(() => {
    const totalSteps = overview.workflows.reduce((n, wf) => n + wf.steps.length, 0);
    const staticPositionIds = new Set<string>();
    for (const wf of overview.workflows) {
      for (const s of wf.steps) if (s.static_position) staticPositionIds.add(s.static_position.id);
    }
    const allWarnings = [
      ...overview.workflows.flatMap(workflowWarnings),
      ...overview.unit_heads.filter((u) => u.unit.is_active).flatMap((u) => u.warnings),
    ];
    return {
      workflows: overview.workflows.length,
      activeWorkflows: overview.workflows.filter((wf) => wf.is_active).length,
      restricted: overview.workflows.filter((wf) => wf.is_restricted).length,
      totalSteps,
      staticPositions: staticPositionIds.size,
      ...countWarnings(allWarnings),
    };
  }, [overview]);

  const selectedWorkflow =
    selectedKey === UNIT_HEADS_KEY
      ? null
      : overview.workflows.find((wf) => wf.id === selectedKey) ?? null;

  const unitHeadWarnings = overview.unit_heads
    .filter((u) => u.unit.is_active)
    .flatMap((u) => u.warnings);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Süreç Tanımları</h1>
          <p className="text-muted-foreground">
            Onay süreçlerinin adımları, onaycı kuralları ve bugün bu kurallara denk gelen kişiler
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="gap-1">
            <Eye className="h-3 w-3" /> Salt okunur
          </Badge>
          <span className="text-xs text-muted-foreground">
            Yüklendi: {formatTrDateTime(overview.generated_at)}
          </span>
        </div>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Süreç" value={`${stats.activeWorkflows} / ${stats.workflows}`} hint="aktif / toplam" />
        <StatTile label="Adım" value={String(stats.totalSteps)} hint={`${stats.restricted} kısıtlı süreç`} />
        <StatTile label="Sabit pozisyon" value={String(stats.staticPositions)} hint="adımlarda referans verilen" />
        <StatTile
          label="Uyarı"
          value={String(stats.errors + stats.warnings)}
          hint={`${stats.errors} hata · ${stats.warnings} uyarı`}
          tone={stats.errors > 0 ? "error" : stats.warnings > 0 ? "warning" : "ok"}
        />
      </div>

      {/* Onaycı tipleri açıklaması */}
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Info className="h-4 w-4" />
          Onaycı tipleri nasıl çözümlenir?
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="mt-2 grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm md:grid-cols-2">
            {(Object.keys(APPROVER_TYPE_HELP) as ApproverType[]).map((type) => (
              <div key={type} className="flex flex-col gap-1">
                <dt>
                  <Badge variant={APPROVER_TYPE_BADGE[type]}>{APPROVER_TYPE_LABELS[type]}</Badge>
                </dt>
                <dd className="text-muted-foreground">{APPROVER_TYPE_HELP[type]}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>

      {/* Ana yerleşim */}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Sol liste */}
        <aside className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Süreç ara (ad veya kod)"
              className="pl-8"
            />
          </div>
          <nav className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded-md border p-1 lg:max-h-[calc(100vh-14rem)]">
            {filteredWorkflows.length === 0 && (
              <p className="p-3 text-center text-sm text-muted-foreground">Eşleşen süreç yok.</p>
            )}
            {filteredWorkflows.map((wf) => {
              const active = wf.id === selectedKey;
              const warnings = workflowWarnings(wf);
              return (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => setSelectedKey(wf.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{wf.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {wf.is_restricted && <Lock className="h-3 w-3 text-muted-foreground" />}
                      <WarningCountBadge items={warnings} />
                    </span>
                  </span>
                  <span className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                    <code className="truncate">{wf.code}</code>
                    <span>· {wf.steps.length} adım</span>
                    {!wf.is_active && <span className="font-medium text-destructive">· pasif</span>}
                  </span>
                </button>
              );
            })}
            <Separator className="my-1" />
            <button
              type="button"
              onClick={() => setSelectedKey(UNIT_HEADS_KEY)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                selectedKey === UNIT_HEADS_KEY ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <Building2 className="h-4 w-4" /> Birim Amirleri
              </span>
              <WarningCountBadge items={unitHeadWarnings} />
            </button>
          </nav>
        </aside>

        {/* Sağ panel */}
        <div className="min-w-0 rounded-lg border p-4 sm:p-6">
          {selectedKey === UNIT_HEADS_KEY ? (
            <UnitHeadsView entries={overview.unit_heads} />
          ) : selectedWorkflow ? (
            <WorkflowDetail workflow={selectedWorkflow} />
          ) : (
            <p className="text-sm text-muted-foreground">Soldan bir süreç seçin.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warning" | "error";
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold",
          tone === "error" && "text-destructive",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "ok" && "text-success"
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
