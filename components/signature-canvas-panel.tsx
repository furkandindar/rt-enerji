"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eraser, RotateCcw } from "lucide-react";

interface SignatureCanvasPanelProps {
  /** Canvas'tan alınan data URL */
  signatureDataUrl: string | null;
  /** Data URL değiştiğinde çağrılır */
  onSignatureChange: (dataUrl: string | null) => void;
  /** İmza kabul edildi mi? */
  isAccepted: boolean;
  /** Kabul durumu değiştiğinde */
  onAcceptChange: (accepted: boolean) => void;
  /** Panel başlığı */
  title?: string;
  /** Açıklama */
  description?: string;
  /** Devre dışı mı? */
  disabled?: boolean;
}

export function SignatureCanvasPanel({
  signatureDataUrl,
  onSignatureChange,
  isAccepted,
  onAcceptChange,
  title = "İMZA / PARAF",
  description = "Aşağıdaki alana imzanızı veya parafınızı atın:",
  disabled = false,
}: SignatureCanvasPanelProps) {
  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
      onSignatureChange(dataUrl);
      setIsEmpty(false);
    }
  };

  const handleClear = () => {
    sigCanvasRef.current?.clear();
    onSignatureChange(null);
    setIsEmpty(true);
    onAcceptChange(false);
  };

  const handleUndo = () => {
    if (!sigCanvasRef.current) return;
    const data = sigCanvasRef.current.toData();
    if (data.length > 0) {
      data.pop();
      sigCanvasRef.current.fromData(data);
      if (data.length === 0) {
        onSignatureChange(null);
        setIsEmpty(true);
        onAcceptChange(false);
      } else {
        const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
        onSignatureChange(dataUrl);
      }
    }
  };

  const hasSignature = !isEmpty && signatureDataUrl;

  return (
    <div className="rounded-lg border-2 border-primary/20 bg-muted/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm uppercase tracking-wide">{title}</h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">{description}</p>

      {/* Canvas */}
      <div className="border rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
        <SignatureCanvas
          ref={sigCanvasRef}
          penColor="#00006B"
          minWidth={3.5}
          maxWidth={5.5}
          canvasProps={{
            className: "w-full h-[160px] cursor-crosshair",
            style: { width: "100%", height: "160px" },
          }}
          onEnd={handleEnd}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={disabled || isEmpty}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Geri Al
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          Temizle
        </Button>
      </div>

      {/* Accept checkbox */}
      <div className="flex items-start space-x-3 pt-2 border-t">
        <Checkbox
          id="signature-canvas-accept"
          checked={isAccepted}
          onCheckedChange={(checked) => onAcceptChange(checked === true)}
          disabled={disabled || !hasSignature}
        />
        <div className="grid gap-1 leading-none">
          <Label
            htmlFor="signature-canvas-accept"
            className="text-sm font-medium leading-snug cursor-pointer"
          >
            İmzamı onaylıyorum
          </Label>
          <p className="text-xs text-muted-foreground">
            Yukarıdaki imzanın size ait olduğunu ve bu belgeyi onayladığınızı kabul ediyorsunuz.
          </p>
        </div>
      </div>
    </div>
  );
}
