"use client";

import { useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
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
import { getApproverDisplayName, type Approval, type PendingApproval } from "@/lib/approvals/types";
import {
  DEFAULT_REVISION_RETURN_MODE,
  getRevisionTargetCandidates,
  isReturnModeRelevant,
  type RevisionReturnMode,
} from "@/lib/workflow/revision-target";
import { getRequesterFullName } from "./utils";

export interface RevisionChoice {
  /** null = talep sahibi */
  targetApprovalId: string | null;
  returnMode: RevisionReturnMode;
  /** Bildirim metni için (toast) — "Ad Soyad" */
  targetName: string | null;
}

const REQUESTER_VALUE = "requester";

/** Revizeyi isteyenin zincirdeki sırası (detay GET'inde her zaman var; yoksa current_step). */
function reviewerSequenceOf(approval: PendingApproval): number {
  return approval.sequence_order ?? approval.request.current_step;
}

/**
 * Pencereye gerek var mı: seçilebilecek ara adım yoksa ve talep sahibiyle
 * revizeyi isteyen arasında adım bulunmuyorsa (ör. 2. adım) tek seçenek bugünkü
 * akıştır → revize doğrudan gönderilir.
 */
export function needsRevisionTargetDialog(approval: PendingApproval): boolean {
  const reviewerSequence = reviewerSequenceOf(approval);
  if (isReturnModeRelevant(1, reviewerSequence)) return true;
  return getRevisionCandidates(approval).length > 0;
}

function getRevisionCandidates(approval: PendingApproval): Approval[] {
  return getRevisionTargetCandidates(approval.request.approvals ?? [], {
    sequence_order: reviewerSequenceOf(approval),
    approver_employee_id: approval.approver_employee_id ?? "",
  });
}

interface RevisionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approval: PendingApproval;
  comment: string;
  isSubmitting: boolean;
  onConfirm: (choice: RevisionChoice) => void;
}

// "Revize İste" ile karar arasına giren seçim penceresi: revizeyi kimin düzelteceği
// (talep sahibi ya da önceki bir adım) ve düzeltme sonrası akış. Aday kuralı
// sunucuyla ortak (lib/workflow/revision-target.ts); sunucu yeniden doğrular.
export function RevisionRequestDialog({
  open,
  onOpenChange,
  approval,
  comment,
  isSubmitting,
  onConfirm,
}: RevisionRequestDialogProps) {
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
        {/* İçerik yalnız açıkken mount olur → her açılış varsayılan seçimle başlar */}
        <RevisionRequestForm
          approval={approval}
          comment={comment}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

type PreviewKind = "kept" | "fixes" | "edits" | "reapproves" | "self";

const PREVIEW_LABEL: Record<PreviewKind, string> = {
  kept: "Onayı korunur",
  fixes: "Düzeltir",
  edits: "Formu düzenler",
  reapproves: "Yeniden onaylar",
  self: "Siz",
};

function RevisionRequestForm({
  approval,
  comment,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  approval: PendingApproval;
  comment: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (choice: RevisionChoice) => void;
}) {
  const [targetValue, setTargetValue] = useState<string>(REQUESTER_VALUE);
  const [returnMode, setReturnMode] = useState<RevisionReturnMode>(DEFAULT_REVISION_RETURN_MODE);

  const reviewerSequence = reviewerSequenceOf(approval);
  const candidates = useMemo(() => getRevisionCandidates(approval), [approval]);
  const requesterName = getRequesterFullName(approval.request.requester);

  const target = candidates.find((c) => c.id === targetValue) ?? null;
  const targetSequence = target?.sequence_order ?? 1;
  const modeRelevant = isReturnModeRelevant(targetSequence, reviewerSequence);
  const effectiveMode = modeRelevant ? returnMode : DEFAULT_REVISION_RETURN_MODE;
  const targetLabel = target ? getApproverDisplayName(target) : requesterName;

  // Revizeyi isteyene kadar zincirin bu seçimle nasıl ilerleyeceği
  const preview = useMemo(() => {
    const chain = [...(approval.request.approvals ?? [])]
      .filter((a) => a.sequence_order <= reviewerSequence)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    return chain.map((a) => {
      let kind: PreviewKind;
      if (a.id === approval.id) kind = "self";
      else if (a.sequence_order === targetSequence) kind = target ? "fixes" : "edits";
      else if (a.sequence_order < targetSequence) kind = "kept";
      else kind = effectiveMode === "RETURN_TO_REVIEWER" ? "kept" : "reapproves";
      return {
        key: a.id,
        sequence: a.sequence_order,
        personName: getApproverDisplayName(a),
        stepName: a.workflow_step?.name ?? "",
        kind,
      };
    });
  }, [approval, reviewerSequence, targetSequence, target, effectiveMode]);

  const handleConfirm = () => {
    if (isSubmitting) return;
    onConfirm({
      targetApprovalId: target?.id ?? null,
      returnMode: effectiveMode,
      targetName: target?.approver ? `${target.approver.first_name} ${target.approver.last_name}` : null,
    });
  };

  const trimmedComment = comment.trim();

  return (
    <>
      <DialogHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
          <RotateCcw className="size-5" />
        </div>
        <DialogTitle>Revize iste</DialogTitle>
        <DialogDescription>Revizeyi kimin düzelteceğini ve sonrasında talebin nasıl ilerleyeceğini seçin.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* Revize sorumlusu */}
        <div className="space-y-2">
          <Label>Revize sorumlusu</Label>
          <RadioGroup value={targetValue} onValueChange={setTargetValue} className="gap-2" disabled={isSubmitting}>
            <TargetOption
              id="revision-target-requester"
              value={REQUESTER_VALUE}
              selected={targetValue === REQUESTER_VALUE}
              title={`Talep sahibi — ${requesterName}`}
              description="Formu düzenleyip yeniden gönderir."
            />
            {candidates.map((c) => (
              <TargetOption
                key={c.id}
                id={`revision-target-${c.id}`}
                value={c.id}
                selected={targetValue === c.id}
                title={`${c.sequence_order}. ${c.workflow_step?.name ?? "Adım"} — ${getApproverDisplayName(c)}`}
                description="Yalnız kendi adımını düzeltip yeniden onaylar; talep sahibine dönmez."
              />
            ))}
          </RadioGroup>
        </div>

        {/* Düzeltme sonrası */}
        {modeRelevant && (
          <div className="space-y-2">
            <Label>Düzeltme sonrası</Label>
            <RadioGroup
              value={returnMode}
              onValueChange={(v) => setReturnMode(v as RevisionReturnMode)}
              className="gap-2"
              disabled={isSubmitting}
            >
              <TargetOption
                id="revision-mode-restart"
                value="RESTART_FROM_TARGET"
                selected={returnMode === "RESTART_FROM_TARGET"}
                title="Aradaki adımlar yeniden onaylasın"
                description={
                  target
                    ? "Adımlar birbirine bağlıysa: düzeltmeden sonra zincir oradan sırayla size kadar ilerler."
                    : "Adımlar birbirine bağlıysa: yeniden gönderimde zincir baştan ilerler."
                }
              />
              <TargetOption
                id="revision-mode-return"
                value="RETURN_TO_REVIEWER"
                selected={returnMode === "RETURN_TO_REVIEWER"}
                title="Doğrudan bana dönsün"
                description="Düzeltme aradaki adımları ilgilendirmiyorsa: aradaki onaylar korunur, talep düzeltmeden sonra size gelir."
              />
            </RadioGroup>
          </div>
        )}

        {/* Önizleme */}
        {preview.length > 0 && (
          <div className="space-y-2">
            <Label>Akış</Label>
            <ol className="space-y-1 rounded-lg border bg-muted/30 p-2 text-sm">
              {preview.map((row) => (
                <li
                  key={row.key}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5",
                    (row.kind === "fixes" || row.kind === "edits") && "bg-orange-100/70 font-medium dark:bg-orange-950/50",
                    row.kind === "self" && "ring-1 ring-primary/40"
                  )}
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">{row.sequence}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.personName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.stepName}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      row.kind === "kept" && "text-green-700 dark:text-green-400",
                      (row.kind === "fixes" || row.kind === "edits") && "text-orange-700 dark:text-orange-300",
                      row.kind === "reapproves" && "text-muted-foreground",
                      row.kind === "self" && "text-primary"
                    )}
                  >
                    {PREVIEW_LABEL[row.kind]}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {trimmedComment && (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Revize notunuz ({targetLabel} görecek)</p>
            <p className="line-clamp-3 wrap-break-word border-l-2 pl-3 italic">{trimmedComment}</p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button
          className="bg-orange-600 text-white hover:bg-orange-700"
          onClick={handleConfirm}
          disabled={isSubmitting || !trimmedComment}
        >
          {isSubmitting && <Loader2 className="animate-spin" />}
          {target ? "Sorumluya Gönder" : "Talep Sahibine Gönder"}
        </Button>
      </DialogFooter>
    </>
  );
}

function TargetOption({
  id,
  value,
  selected,
  title,
  description,
}: {
  id: string;
  value: string;
  selected: boolean;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
        selected && "border-primary bg-primary/5"
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block wrap-break-word font-medium">{title}</span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
