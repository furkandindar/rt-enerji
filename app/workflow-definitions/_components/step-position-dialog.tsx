"use client";

// Sabit pozisyonlu adımın pozisyonunu değiştirme penceresi (Süreç Tanımları, Faz 2a).
// Seçilebilirlik kuralı motorla aynıdır (lib/workflow/step-position-rules.ts); sunucu
// (PATCH /api/workflow-steps/[id]) aynı kuralı tekrar uygular.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Info, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { STEP_NAME_MAX_LENGTH } from "@/lib/workflow/step-position-rules";
import type { AssignablePosition, ConfigStep } from "@/lib/workflow/config-overview";

interface PendingSummary {
  pending_count: number;
  approvers: { name: string; count: number }[];
}

interface StepPositionDialogProps {
  step: ConfigStep;
  positions: AssignablePosition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StepPositionDialog({ step, positions, open, onOpenChange }: StepPositionDialogProps) {
  const router = useRouter();
  const currentPosition = step.static_position;
  // Adım adı pozisyon başlığını yansıtıyorsa (ör. "İdari İşler Personeli") yeni başlığı
  // önermek mantıklı; işlev adıysa (ör. "İdari İşler Müdürlüğü") dokunmamak.
  const nameMirrorsPosition = Boolean(currentPosition && step.name === currentPosition.title);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameEnabled, setRenameEnabled] = useState(nameMirrorsPosition);
  const [nameValue, setNameValue] = useState(step.name);
  const [nameTouched, setNameTouched] = useState(false);
  const [pending, setPending] = useState<PendingSummary | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Her açılışta temiz durum + bekleyen talep özeti
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedId(null);
    setRenameEnabled(nameMirrorsPosition);
    setNameValue(step.name);
    setNameTouched(false);
    setPending(null);
    setPendingError(false);

    let cancelled = false;
    fetch(`/api/workflow-steps/${step.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as PendingSummary;
        if (!cancelled) setPending(data);
      })
      .catch(() => {
        if (!cancelled) setPendingError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step.id, step.name, nameMirrorsPosition]);

  const selected = positions.find((p) => p.id === selectedId) ?? null;

  // Seçim değişince ad önerisi yeni başlığı izler (kullanıcı adı elle değiştirmediyse)
  useEffect(() => {
    if (selected && !nameTouched) setNameValue(selected.title);
  }, [selected, nameTouched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return positions;
    return positions.filter((p) =>
      [p.title, p.job_code ?? "", p.unit?.name ?? "", ...p.holders.map((h) => h.full_name)]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(q)
    );
  }, [positions, query]);

  const trimmedName = nameValue.trim();
  const nameInvalid = renameEnabled && (!trimmedName || trimmedName.length > STEP_NAME_MAX_LENGTH);
  const canSave = Boolean(selected) && !selected?.blocker && !nameInvalid && !saving;

  const handleSave = async () => {
    if (!selected || !canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflow-steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          static_position_id: selected.id,
          ...(renameEnabled ? { name: trimmedName } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Adım güncellenemedi");
      }
      toast.success(`"${renameEnabled ? trimmedName : step.name}" adımı ${selected.title} pozisyonuna bağlandı`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adım güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pozisyonu değiştir — {step.step_order}. {step.name}</DialogTitle>
          <DialogDescription>
            Mevcut:{" "}
            {currentPosition ? (
              <>
                <span className="font-medium text-foreground">{currentPosition.title}</span>
                {currentPosition.holders.length > 0 && (
                  <> · {currentPosition.holders.map((h) => h.full_name).join(", ")}</>
                )}
              </>
            ) : (
              "pozisyon seçilmemiş"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Arama + liste */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Pozisyon, kod (BID500), birim ya da kişi ara…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border" style={{ maxHeight: "40vh" }}>
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Eşleşen pozisyon yok.</p>
            ) : (
              <ul className="divide-y">
                {filtered.map((p) => {
                  const isCurrent = p.id === currentPosition?.id;
                  const isSelected = p.id === selectedId;
                  const disabled = Boolean(p.blocker) || isCurrent;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                          disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
                        )}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-medium">{p.title}</span>
                            {p.job_code && (
                              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{p.job_code}</code>
                            )}
                            {isCurrent && (
                              <Badge variant="outline" className="text-[10px]">
                                Mevcut
                              </Badge>
                            )}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {p.unit && <span>{p.unit.name}</span>}
                            {p.holders.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {p.holders.map((h) => h.full_name).join(", ")}
                              </span>
                            )}
                          </span>
                          {p.blocker && <span className="text-xs text-destructive">{p.blocker}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Seçim önizlemesi + adım adı */}
        {selected && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <p>
              Yeni onaycı:{" "}
              <span className="font-semibold">{selected.holders[0]?.full_name}</span>
              <span className="text-muted-foreground"> · {selected.title}</span>
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rename-step"
                  checked={renameEnabled}
                  onCheckedChange={(v) => setRenameEnabled(v === true)}
                />
                <Label htmlFor="rename-step" className="font-normal">
                  Adım adını da güncelle
                </Label>
              </div>
              {renameEnabled && (
                <Input
                  value={nameValue}
                  maxLength={STEP_NAME_MAX_LENGTH}
                  onChange={(e) => {
                    setNameValue(e.target.value);
                    setNameTouched(true);
                  }}
                  aria-invalid={nameInvalid}
                />
              )}
            </div>
          </div>
        )}

        {/* Etki notu */}
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex flex-col gap-1">
            <p>
              Değişiklik yalnız <span className="font-medium">bundan sonra gönderilen</span> talepleri etkiler.
            </p>
            {pendingError ? (
              <p className="text-muted-foreground">Bekleyen talepler yüklenemedi.</p>
            ) : !pending ? (
              <p className="text-muted-foreground">Bekleyen talepler kontrol ediliyor…</p>
            ) : pending.pending_count === 0 ? (
              <p className="text-muted-foreground">Bu adımda bekleyen talep yok.</p>
            ) : (
              <p>
                Bu adımda bekleyen <span className="font-medium">{pending.pending_count} talep</span> mevcut
                onaycısında kalır ({pending.approvers.map((a) => `${a.name}: ${a.count}`).join(", ")}).
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
