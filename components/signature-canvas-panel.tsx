"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Arka planda gösterilecek kaşe görseli (WYSIWYG hizalama için) */
  stampImageUrl?: string;
  /** Kanvas en/boy oranı = kaşe genişliği / yüksekliği (örn. 190/75) */
  stampAspectRatio?: number;
}

export function SignatureCanvasPanel({
  signatureDataUrl,
  onSignatureChange,
  isAccepted,
  onAcceptChange,
  title = "İMZA / PARAF",
  description = "Aşağıdaki alana imzanızı veya parafınızı atın:",
  disabled = false,
  stampImageUrl,
  stampAspectRatio,
}: SignatureCanvasPanelProps) {
  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(0);

  // Kanvas genişliğini ölç (responsive). Kalem genişliğini bu ölçüye ORANLA
  // hesaplıyoruz; çünkü kanvas PDF'te 190x75'e ölçekleniyor. Sabit px kalem
  // dar mobil kanvasta orantısal olarak kalın çıkıyordu — oranlamak çizgiyi
  // her cihazda aynı pt kalınlığında tutar. (Prop değişimi pad'i temizlemez;
  // react-signature-canvas componentDidUpdate'te Object.assign ile uygular.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCanvasWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Çizgi kalınlığı = kanvas genişliğinin sabit oranı (≈ masaüstü görünümü).
  const refWidth = canvasWidth || 480; // ilk render fallback
  const penMinWidth = Math.max(1.2, refWidth * 0.0073);
  const penMaxWidth = Math.max(penMinWidth + 0.5, refWidth * 0.0115);

  const handleEnd = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      // getCanvas() (kırpılmamış tüm kanvas) — imzanın kaşe üzerindeki konumu/
      // ölçeği aynen korunsun diye trim YAPMIYORUZ. Kanvas kaşe oranında olduğu
      // için PDF'te tam kaşe alanına 1:1 basılabiliyor (WYSIWYG).
      const dataUrl = sigCanvasRef.current.getCanvas().toDataURL("image/png");
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
        const dataUrl = sigCanvasRef.current.getCanvas().toDataURL("image/png");
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

      {/* Canvas — kaşe oranında; arkada soluk kaşe görseli, üstüne imza (WYSIWYG) */}
      <div
        ref={containerRef}
        className="relative w-full border rounded-lg bg-white dark:bg-zinc-900 overflow-hidden"
        style={stampAspectRatio ? { aspectRatio: stampAspectRatio } : { height: 160 }}
      >
        {stampImageUrl && (
          <img
            src={stampImageUrl}
            alt="Kaşe önizleme"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-40 select-none"
          />
        )}
        <SignatureCanvas
          ref={sigCanvasRef}
          penColor="#00006B"
          minWidth={penMinWidth}
          maxWidth={penMaxWidth}
          canvasProps={{
            className: "absolute inset-0 h-full w-full cursor-crosshair touch-none",
            style: { width: "100%", height: "100%" },
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
