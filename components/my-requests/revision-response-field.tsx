"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RevisionResponseState } from "@/hooks/use-revision-response";
import { REVISION_RESPONSE_MAX_LENGTH } from "@/lib/workflow/revision-response";

// "Revize Açıklaması" alanı: talep sahibi revize edilen talebi yeniden gönderirken
// yaptığı düzenlemeyi açıklar. Durum useRevisionResponse'tan gelir; alan
// görünmüyorsa (revize değil / talep sahibi değil) hiçbir şey render etmez.

interface RevisionResponseFieldProps {
  state: RevisionResponseState;
  disabled?: boolean;
}

export function RevisionResponseField({ state, disabled }: RevisionResponseFieldProps) {
  if (!state.visible) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor="revision-response">Revize Açıklaması</Label>
      <Textarea
        id="revision-response"
        value={state.value}
        onChange={(e) => state.setValue(e.target.value)}
        maxLength={REVISION_RESPONSE_MAX_LENGTH}
        rows={4}
        disabled={disabled}
        placeholder="Revize talebine karşılık yaptığınız düzenlemeyi açıklayın"
      />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Bu not PDF&apos;e yazılmaz; süreç logunda, onaycı ekranında ve onay e-postasında görünür.
        </span>
        <span className="shrink-0 tabular-nums">
          {state.value.length}/{REVISION_RESPONSE_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
