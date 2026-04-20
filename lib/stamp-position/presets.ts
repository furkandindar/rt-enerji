/**
 * Kaşe konumu için preset → normalized ratio dönüşümü.
 *
 * Ratio konvansiyonu: kaşenin SOL-ÜST köşesinin sayfa genişliğine/yüksekliğine
 * oranı (0-1). UI top-left origin. Backend (stampPDF) aynı konvansiyonu kullanır.
 */

export type StampPreset = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';

export interface Ratio {
  x: number;
  y: number;
}

/** Backend'deki calculateStampPosition ile aynı margin (bkz. lib/pdf/stamp-pdf.ts) */
export const PRESET_MARGIN_PT = 30;

export const PRESET_LABELS: Record<StampPreset, string> = {
  'top-left': 'Sol Üst',
  'top-right': 'Sağ Üst',
  center: 'Orta',
  'bottom-left': 'Sol Alt',
  'bottom-right': 'Sağ Alt',
};

export const PRESET_ORDER: StampPreset[] = [
  'top-left',
  'top-right',
  'center',
  'bottom-left',
  'bottom-right',
];

export const DEFAULT_PRESET: StampPreset = 'bottom-right';

interface PresetToRatioParams {
  preset: StampPreset;
  pageWidthPt: number;
  pageHeightPt: number;
  stampWidthPt: number;
  stampHeightPt: number;
  marginPt?: number;
}

/**
 * Bir preset'i, verilen sayfa ve kaşe boyutlarına göre normalized ratio'ya çevirir.
 * Sonuç otomatik olarak 0-1 aralığına clamp edilir (çok büyük kaşe / küçük sayfa koruması).
 */
export function presetToRatio(params: PresetToRatioParams): Ratio {
  const margin = params.marginPt ?? PRESET_MARGIN_PT;
  const mx = margin / params.pageWidthPt;
  const my = margin / params.pageHeightPt;
  const sw = params.stampWidthPt / params.pageWidthPt;
  const sh = params.stampHeightPt / params.pageHeightPt;

  let x: number;
  let y: number;

  switch (params.preset) {
    case 'top-left':
      x = mx;
      y = my;
      break;
    case 'top-right':
      x = 1 - mx - sw;
      y = my;
      break;
    case 'bottom-left':
      x = mx;
      y = 1 - my - sh;
      break;
    case 'bottom-right':
      x = 1 - mx - sw;
      y = 1 - my - sh;
      break;
    case 'center':
      x = (1 - sw) / 2;
      y = (1 - sh) / 2;
      break;
  }

  return {
    x: clamp01(x),
    y: clamp01(y),
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
