"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SIGNATURE_FONTS,
  SignatureFont,
  DEFAULT_SIGNATURE_FONT,
  getSignatureFontClass,
} from "@/lib/signature/types";

interface SignatureManagerProps {
  employeeId: string;
  firstName: string;
  lastName: string;
  currentSignatureText: string | null;
  currentSignatureFont: SignatureFont | null;
}

export function SignatureManager({
  employeeId,
  firstName,
  lastName,
  currentSignatureText,
  currentSignatureFont,
}: SignatureManagerProps) {
  const defaultText = `${firstName} ${lastName}`;
  const [isEditing, setIsEditing] = useState(!currentSignatureText);
  const [isLoading, setIsLoading] = useState(false);
  const [signatureText, setSignatureText] = useState(currentSignatureText || defaultText);
  const [selectedFont, setSelectedFont] = useState<SignatureFont>(
    currentSignatureFont || DEFAULT_SIGNATURE_FONT
  );
  const router = useRouter();
  const supabase = createClient();

  const handleSave = async () => {
    if (!signatureText.trim()) {
      toast.error("Lütfen imza metni girin");
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("employees")
        .update({
          signature_text: signatureText.trim(),
          signature_font: selectedFont,
        })
        .eq("id", employeeId);

      if (updateError) throw updateError;

      toast.success("İmza başarıyla kaydedildi");
      setIsEditing(false);

      // Dispatch custom event to notify SignatureReminder component
      window.dispatchEvent(new CustomEvent("signatureUpdated"));

      router.refresh();
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error("İmza kaydedilemedi");
    } finally {
      setIsLoading(false);
    }
  };

  // Editing mode
  if (isEditing) {
    return (
      <div className="space-y-6">
        {/* Signature Text Input */}
        <div className="space-y-2">
          <Label htmlFor="signature-text">İmza Metni</Label>
          <Input
            id="signature-text"
            value={signatureText}
            onChange={(e) => setSignatureText(e.target.value)}
            placeholder="Ad Soyad"
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            İmzanızda görünecek metin (genelde ad soyad)
          </p>
        </div>

        {/* Font Selection */}
        <div className="space-y-3">
          <Label>Font Seçimi</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SIGNATURE_FONTS.map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => setSelectedFont(font)}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all",
                  "hover:border-primary/50 hover:bg-muted/50",
                  selectedFont === font
                    ? "border-primary bg-primary/5"
                    : "border-muted"
                )}
              >
                <span className="text-xs text-muted-foreground mb-2">{font}</span>
                <span
                  className={cn(
                    getSignatureFontClass(font),
                    "text-2xl sm:text-3xl"
                  )}
                >
                  {signatureText || defaultText}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <Label>Önizleme</Label>
          <div className="border rounded-lg p-6 bg-white dark:bg-zinc-900">
            <div className="text-center">
              <span
                className={cn(
                  getSignatureFontClass(selectedFont),
                  "text-4xl sm:text-5xl text-foreground"
                )}
              >
                {signatureText || defaultText}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isLoading || !signatureText.trim()}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Kaydediliyor..." : "İmzamı Kaydet"}
          </Button>
          {currentSignatureText && (
            <Button
              variant="ghost"
              onClick={() => {
                setSignatureText(currentSignatureText);
                setSelectedFont(currentSignatureFont || DEFAULT_SIGNATURE_FONT);
                setIsEditing(false);
              }}
              disabled={isLoading}
            >
              İptal
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Display mode (signature exists)
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-6 bg-white dark:bg-zinc-900">
        <div className="text-center">
          <span
            className={cn(
              getSignatureFontClass(currentSignatureFont),
              "text-4xl sm:text-5xl text-foreground"
            )}
          >
            {currentSignatureText}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Font: {currentSignatureFont || DEFAULT_SIGNATURE_FONT}
        </p>
        <Button variant="outline" onClick={() => setIsEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Düzenle
        </Button>
      </div>
    </div>
  );
}

