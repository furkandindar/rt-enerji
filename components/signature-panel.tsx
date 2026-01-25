"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getSignatureFontClass, SignatureFont } from "@/lib/signature/types";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface SignaturePanelProps {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
  isAccepted: boolean;
  onAcceptChange: (accepted: boolean) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}

export function SignaturePanel({
  signatureText,
  signatureFont,
  isAccepted,
  onAcceptChange,
  title = "DİJİTAL İMZA",
  description = "Bu belgeyi imzanızla onaylayacaksınız:",
  disabled = false,
}: SignaturePanelProps) {
  // İmza ayarlanmamışsa uyarı göster
  if (!signatureText || !signatureFont) {
    return (
      <div className="rounded-lg border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              İmza Ayarlanmamış
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              İşlem yapabilmek için önce dijital imzanızı ayarlamanız gerekmektedir.
            </p>
            <Link
              href="/profile"
              className="inline-flex items-center text-sm font-medium text-amber-900 dark:text-amber-100 underline underline-offset-4 hover:no-underline"
            >
              Profil sayfasına git →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-primary/20 bg-muted/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {/* <span className="text-lg">🖊️</span> */}
        <h3 className="font-semibold text-sm uppercase tracking-wide">{title}</h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">{description}</p>

      {/* Signature Preview */}
      <div className="border rounded-lg p-6 bg-white dark:bg-zinc-900">
        <div className="text-center">
          <span
            className={cn(
              getSignatureFontClass(signatureFont),
              "text-3xl sm:text-4xl text-foreground"
            )}
          >
            {signatureText}
          </span>
        </div>
      </div>

      {/* Checkbox */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="signature-accept"
          checked={isAccepted}
          onCheckedChange={(checked) => onAcceptChange(checked === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <Label
          htmlFor="signature-accept"
          className={cn(
            "text-sm leading-relaxed cursor-pointer",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          Bu belgeyi dijital imzamla onayladığımı kabul ediyorum
        </Label>
      </div>
    </div>
  );
}

