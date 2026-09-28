"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { UserMultiPicker } from "@/components/user-multi-picker";
import { useApproverCandidates } from "@/components/extra-approvers/use-approver-candidates";
import { MAX_EXTRA_APPROVERS } from "@/lib/workflow/extra-approvers-shared";
import { getApproverDisplayName, type PendingApproval } from "@/lib/approvals/types";

export type ExtraApproversMode = "DIRECT" | "REVISION";

export interface ExtraApproversSubmitInput {
  mode: ExtraApproversMode;
  employeeIds: string[];
  note: string;
}

interface ExtraApproversDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approval: PendingApproval;
  /** Onay ekranındaki yorum alanı — not alanının başlangıç değeri */
  initialNote: string;
  isSubmitting: boolean;
  /** true dönerse işlem başarılı (hook sayfayı listeye yönlendirir) */
  onSubmit: (input: ExtraApproversSubmitInput) => Promise<boolean>;
}

// Yönetici (can_add_extra_approvers adımı — Olur'da Genel Müdür) onay zincirine
// zorunlu ek onaycı ekler. İki mod:
//  - DIRECT: belge değişmeden; eklenenler mevcut turda yöneticinin hemen önüne girer,
//    onlar onaylayınca talep yöneticiye döner (önceki onaylar geçerli kalır).
//  - REVISION: revize notuyla talep sahibine döner; yeniden gönderince zincir baştan
//    kurulur, eklenenler yöneticinin hemen önünde yer alır.
// Kişiler yalnız aktif + sistem hesabı bağlı çalışanlardan seçilir; sunucu yeniden doğrular.
export function ExtraApproversDialog({
  open,
  onOpenChange,
  approval,
  initialNote,
  isSubmitting,
  onSubmit,
}: ExtraApproversDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        // Gönderim sürerken Esc / dışarı tık pencereyi kapatmasın
        if (!isSubmitting) onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        showCloseButton={!isSubmitting}
      >
        {/* İçerik yalnız açıkken mount olur → her açılış temiz state ile başlar */}
        <ExtraApproversForm
          approval={approval}
          initialNote={initialNote}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PreviewRow {
  key: string;
  stepName: string;
  personName: string;
  subtitle?: string | null;
  kind: "existing" | "new" | "self";
  approved: boolean;
}

function ExtraApproversForm({
  approval,
  initialNote,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  approval: PendingApproval;
  initialNote: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: ExtraApproversSubmitInput) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<ExtraApproversMode>("DIRECT");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState(initialNote);
  const { candidates, loading, error } = useApproverCandidates(true);

  const chain = useMemo(
    () => [...(approval.request.approvals ?? [])].sort((a, b) => a.sequence_order - b.sequence_order),
    [approval.request.approvals]
  );

  // Zincirde zaten olanlar, talep sahibi ve yöneticinin kendisi seçilemez (sunucu da reddeder)
  const excludedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of chain) if (a.approver?.id) ids.add(a.approver.id);
    if (approval.request.requester?.id) ids.add(approval.request.requester.id);
    if (approval.approver_employee_id) ids.add(approval.approver_employee_id);
    if (approval.viewer?.employee_id) ids.add(approval.viewer.employee_id);
    return Array.from(ids);
  }, [chain, approval]);

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    const selfIndex = chain.findIndex((a) => a.id === approval.id);
    const before = selfIndex >= 0 ? chain.slice(0, selfIndex) : chain;
    const fromSelf = selfIndex >= 0 ? chain.slice(selfIndex) : [];
    const toRow = (a: (typeof chain)[number]): PreviewRow => ({
      key: a.id,
      stepName: a.workflow_step?.name ?? "",
      personName: getApproverDisplayName(a),
      kind: a.id === approval.id ? "self" : "existing",
      approved: a.status === "APPROVED",
    });
    const newRows: PreviewRow[] = selectedIds.map((id) => {
      const c = candidateById.get(id);
      return {
        key: `new-${id}`,
        stepName: "Ek Onaycı",
        personName: c ? `${c.first_name} ${c.last_name}` : "Seçilen kişi",
        subtitle: c?.position_title,
        kind: "new",
        approved: false,
      };
    });
    return [...before.map(toRow), ...newRows, ...fromSelf.map(toRow)];
  }, [chain, approval.id, selectedIds, candidateById]);

  const trimmedNote = note.trim();
  const canSubmit =
    !isSubmitting && selectedIds.length > 0 && (mode === "DIRECT" || trimmedNote.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({ mode, employeeIds: selectedIds, note: trimmedNote });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserPlus className="size-5" />
        </div>
        <DialogTitle>Onay zincirine kişi ekle</DialogTitle>
        <DialogDescription>
          Eklediğiniz kişiler sizden hemen önce, seçtiğiniz sırayla zorunlu onay verir.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Mod */}
        <div className="space-y-2">
          <Label>Belgede değişiklik gerekiyor mu?</Label>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as ExtraApproversMode)}
            className="gap-2"
            disabled={isSubmitting}
          >
            <label
              htmlFor="extra-mode-direct"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                mode === "DIRECT" && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem id="extra-mode-direct" value="DIRECT" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block font-medium">Hayır — doğrudan onaya gönder</span>
                <span className="block text-muted-foreground">
                  Talep sahibine dönmez. Eklenenler onaylayınca talep size geri gelir; önceki onaylar geçerli kalır.
                </span>
              </span>
            </label>
            <label
              htmlFor="extra-mode-revision"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                mode === "REVISION" && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem id="extra-mode-revision" value="REVISION" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block font-medium">Evet — revize iste</span>
                <span className="block text-muted-foreground">
                  Talep sahibi belgeyi düzenleyip (veya olduğu gibi) yeniden gönderir; zincir baştan kurulur ve
                  eklediğiniz kişiler sizden önce onay verir.
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>

        {/* Kişiler */}
        <div className="space-y-2">
          <Label>Eklenecek kişiler ve sırası</Label>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Çalışan listesi yükleniyor…
            </div>
          ) : (
            <UserMultiPicker
              value={selectedIds}
              onChange={setSelectedIds}
              employees={candidates}
              excludeEmployeeIds={excludedIds}
              disabled={isSubmitting}
              variant="inline"
              maxSelected={MAX_EXTRA_APPROVERS}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Yalnız aktif ve sistem hesabı olan çalışanlar listelenir; zincirde zaten olanlar seçilemez.
          </p>
        </div>

        {/* Not */}
        <div className="space-y-2">
          <Label htmlFor="extra-approvers-note">
            {mode === "REVISION" ? (
              <>
                Revize notu <span className="text-red-500">*</span>
              </>
            ) : (
              "Eklenen kişilere not (opsiyonel)"
            )}
          </Label>
          <Textarea
            id="extra-approvers-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              mode === "REVISION"
                ? "Talep sahibinden ne istediğinizi yazın…"
                : "Örn: Teslime ilişkin proje müdürü onayı gerekli."
            }
            disabled={isSubmitting}
          />
        </div>

        {/* Önizleme */}
        {selectedIds.length > 0 && (
          <div className="space-y-2">
            <Label>Oluşacak onay zinciri</Label>
            <ol className="space-y-1 rounded-lg border bg-muted/30 p-2 text-sm">
              {previewRows.map((row, index) => (
                <li
                  key={row.key}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5",
                    row.kind === "new" && "bg-primary/10 font-medium",
                    row.kind === "self" && "ring-1 ring-primary/40"
                  )}
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.personName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.stepName}
                      {row.subtitle ? ` · ${row.subtitle}` : ""}
                    </span>
                  </span>
                  {row.kind === "new" && <span className="text-xs text-primary">Yeni</span>}
                  {row.kind === "self" && <span className="text-xs text-primary">Siz</span>}
                  {mode === "DIRECT" && row.kind === "existing" && row.approved && (
                    <Check className="size-4 shrink-0 text-green-600" aria-label="Onayladı" />
                  )}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              {mode === "DIRECT"
                ? "Onaylanmış adımlar geçerli kalır; sıra yeni eklenen ilk kişiden devam eder."
                : "Talep yeniden gönderildiğinde tüm adımlar baştan onaylanır; standart onaycılar güncel organizasyona göre yeniden belirlenir."}
            </p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {mode === "DIRECT" ? "Ekle ve Onaya Gönder" : "Ekle ve Revize İste"}
        </Button>
      </DialogFooter>
    </>
  );
}
