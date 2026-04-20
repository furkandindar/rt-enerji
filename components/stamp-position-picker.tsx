"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  type Ratio,
  type StampPreset,
  DEFAULT_PRESET,
  PRESET_LABELS,
  PRESET_ORDER,
  presetToRatio,
} from "@/lib/stamp-position/presets";

// pdfjs worker kurulumu — client-side, bir kez
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

export interface StampPositionValue {
  /** Tüm sayfalar için varsayılan konum (kaşe sol-üst köşesi, 0-1). */
  defaultRatio: Ratio | null;
  /** Sayfa bazlı override. Anahtar 1-tabanlı sayfa numarası (string). */
  overrides: Record<string, Ratio>;
}

interface StampInfo {
  imageUrl: string;
  widthPt: number;
  heightPt: number;
}

interface StampPositionPickerProps {
  pdfFile: File;
  stamp: StampInfo;
  /** 1-tabanlı seçili sayfa listesi; "all" ise parent undefined gönderir, picker numPages yüklenince 1..numPages kullanır */
  selectedPages?: number[];
  value: StampPositionValue;
  onChange: (value: StampPositionValue) => void;
  /** İlk yüklemede default ratio null ise otomatik olarak bu preset uygulanır */
  initialPreset?: StampPreset;
}

interface PageDims {
  widthPt: number;
  heightPt: number;
}

export default function StampPositionPicker({
  pdfFile,
  stamp,
  selectedPages,
  value,
  onChange,
  initialPreset = DEFAULT_PRESET,
}: StampPositionPickerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDims, setPageDims] = useState<PageDims | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // PDF dosyasını ArrayBuffer'a oku, react-pdf'e { data } olarak geçir.
  // Doğrudan File / blob URL geçmek StrictMode + worker çifte mount durumlarında
  // "Unexpected server response (0)" hatasına yol açabiliyor; data buffer güvenli yol.
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let cancelled = false;
    pdfFile.arrayBuffer().then((buf) => {
      if (!cancelled) setPdfData(new Uint8Array(buf));
    });
    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  // react-pdf'in file prop identity'sine göre yeniden yüklemesini engelle
  const documentFile = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  // Container genişliğini takip et
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Seçili sayfa listesinden aktif sayfayı senkronize et
  const effectiveSelectedPages = useMemo<number[]>(() => {
    if (selectedPages && selectedPages.length > 0) return [...selectedPages].sort((a, b) => a - b);
    if (numPages) return Array.from({ length: numPages }, (_, i) => i + 1);
    return [];
  }, [selectedPages, numPages]);

  useEffect(() => {
    if (effectiveSelectedPages.length === 0) return;
    if (!effectiveSelectedPages.includes(currentPage)) {
      setCurrentPage(effectiveSelectedPages[0]);
    }
  }, [effectiveSelectedPages, currentPage]);

  // İlk yüklemede default ratio null ise preset uygula
  useEffect(() => {
    if (initializedRef.current) return;
    if (!pageDims || value.defaultRatio !== null) {
      if (value.defaultRatio !== null) initializedRef.current = true;
      return;
    }
    initializedRef.current = true;
    const ratio = presetToRatio({
      preset: initialPreset,
      pageWidthPt: pageDims.widthPt,
      pageHeightPt: pageDims.heightPt,
      stampWidthPt: stamp.widthPt,
      stampHeightPt: stamp.heightPt,
    });
    onChange({ ...value, defaultRatio: ratio });
  }, [pageDims, initialPreset, stamp.widthPt, stamp.heightPt, value, onChange]);

  // Aktif sayfa için ratio (override varsa o, yoksa default)
  const currentKey = String(currentPage);
  const isOverridden = currentKey in value.overrides;
  const activeRatio: Ratio | null = isOverridden
    ? value.overrides[currentKey]
    : value.defaultRatio;

  // Render scale
  const scale = pageDims ? containerWidth / pageDims.widthPt : 1;
  const renderedWidth = pageDims ? pageDims.widthPt * scale : containerWidth;
  const renderedHeight = pageDims ? pageDims.heightPt * scale : 0;
  const stampPxW = stamp.widthPt * scale;
  const stampPxH = stamp.heightPt * scale;

  // Aktif sayfa için ratio güncelle
  const updateActiveRatio = useCallback(
    (ratio: Ratio) => {
      if (isOverridden) {
        onChange({ ...value, overrides: { ...value.overrides, [currentKey]: ratio } });
      } else {
        onChange({ ...value, defaultRatio: ratio });
      }
    },
    [isOverridden, onChange, value, currentKey],
  );

  // Override aç/kapa
  const handleToggleOverride = (checked: boolean) => {
    if (checked) {
      // Şu anki görünen ratio'yu override'a kopyala (varsayılan ratio null ise 0.5,0.5)
      const seed = activeRatio ?? { x: 0.5, y: 0.5 };
      onChange({ ...value, overrides: { ...value.overrides, [currentKey]: seed } });
    } else {
      const next = { ...value.overrides };
      delete next[currentKey];
      onChange({ ...value, overrides: next });
    }
  };

  // Preset snap — aktif sayfaya uygula
  const handlePreset = (preset: StampPreset) => {
    if (!pageDims) return;
    const ratio = presetToRatio({
      preset,
      pageWidthPt: pageDims.widthPt,
      pageHeightPt: pageDims.heightPt,
      stampWidthPt: stamp.widthPt,
      stampHeightPt: stamp.heightPt,
    });
    updateActiveRatio(ratio);
  };

  // Drag başlat (mouse + touch)
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pageWrapperRef.current || !pageDims || !activeRatio) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);

    const rect = pageWrapperRef.current.getBoundingClientRect();
    const stampStartPxX = activeRatio.x * rect.width;
    const stampStartPxY = activeRatio.y * rect.height;
    const pointerOffsetX = e.clientX - rect.left - stampStartPxX;
    const pointerOffsetY = e.clientY - rect.top - stampStartPxY;

    const move = (ev: PointerEvent) => {
      if (!pageWrapperRef.current) return;
      const r = pageWrapperRef.current.getBoundingClientRect();
      const newPxX = ev.clientX - r.left - pointerOffsetX;
      const newPxY = ev.clientY - r.top - pointerOffsetY;
      const maxX = r.width - stampPxW;
      const maxY = r.height - stampPxH;
      const clampedX = Math.max(0, Math.min(newPxX, maxX));
      const clampedY = Math.max(0, Math.min(newPxY, maxY));
      updateActiveRatio({ x: clampedX / r.width, y: clampedY / r.height });
    };

    const up = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Sayfa navigasyonu
  const pageIndexInSelected = effectiveSelectedPages.indexOf(currentPage);
  const canPrev = pageIndexInSelected > 0;
  const canNext = pageIndexInSelected >= 0 && pageIndexInSelected < effectiveSelectedPages.length - 1;
  const goPrev = () => canPrev && setCurrentPage(effectiveSelectedPages[pageIndexInSelected - 1]);
  const goNext = () => canNext && setCurrentPage(effectiveSelectedPages[pageIndexInSelected + 1]);

  const overrideCount = Object.keys(value.overrides).length;

  return (
    <div className="space-y-3">
      {/* Sayfa navigasyonu + özet */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goPrev} disabled={!canPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            Sayfa {currentPage} / {numPages ?? "…"}
            {effectiveSelectedPages.length > 0 && numPages && effectiveSelectedPages.length < numPages && (
              <span className="text-muted-foreground"> (seçili: {effectiveSelectedPages.length})</span>
            )}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={goNext} disabled={!canNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {overrideCount > 0
            ? `${overrideCount} sayfa özel konumda`
            : "Tüm sayfalarda aynı konum"}
        </div>
      </div>

      {/* PDF + draggable kaşe */}
      <div
        ref={containerRef}
        className="relative w-full rounded-md border bg-muted/20 overflow-hidden"
        style={{ minHeight: 200 }}
      >
        {!documentFile ? (
          <PdfLoading />
        ) : (
        <Document
          file={documentFile}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={<PdfLoading />}
          error={<PdfError />}
        >
          {numPages && (
            <div
              ref={pageWrapperRef}
              className="relative mx-auto"
              style={{ width: renderedWidth, height: renderedHeight || undefined }}
            >
              <Page
                pageNumber={currentPage}
                width={containerWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(p) =>
                  setPageDims({ widthPt: p.originalWidth, heightPt: p.originalHeight })
                }
                loading={<PdfLoading />}
              />
              {activeRatio && pageDims && (
                <div
                  onPointerDown={handleDragStart}
                  className={`absolute select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  style={{
                    left: activeRatio.x * renderedWidth,
                    top: activeRatio.y * renderedHeight,
                    width: stampPxW,
                    height: stampPxH,
                    touchAction: "none",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stamp.imageUrl}
                    alt="kaşe"
                    draggable={false}
                    className="w-full h-full pointer-events-none"
                    style={{ opacity: 0.75 }}
                  />
                  <div className="absolute inset-0 ring-2 ring-primary/60 rounded-sm" />
                </div>
              )}
            </div>
          )}
        </Document>
        )}
      </div>

      {/* Preset snap butonları + override toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Hızlı:</span>
        {PRESET_ORDER.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handlePreset(p)}
            disabled={!pageDims}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <Checkbox
            id="stamp-override-toggle"
            checked={isOverridden}
            onCheckedChange={(v) => handleToggleOverride(Boolean(v))}
          />
          <Label htmlFor="stamp-override-toggle" className="text-sm cursor-pointer">
            Bu sayfayı farklı konumlandır
          </Label>
        </div>
      </div>
    </div>
  );
}

function PdfLoading() {
  return (
    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function PdfError() {
  return (
    <div className="flex items-center justify-center h-[300px] text-sm text-destructive">
      PDF yüklenemedi
    </div>
  );
}
