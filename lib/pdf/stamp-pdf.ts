import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { StampPosition } from '@/lib/workflow/types';
import { SignatureFont, DEFAULT_SIGNATURE_FONT } from '@/lib/signature/types';

// İmza font URL'leri (Google Fonts TTF)
const SIGNATURE_FONT_URLS: Record<SignatureFont, string> = {
  'Ballet': 'https://fonts.gstatic.com/s/ballet/v27/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3C4G-EiAou6Y.ttf',
  'Great Vibes': 'https://fonts.gstatic.com/s/greatvibes/v18/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf',
  'Sacramento': 'https://fonts.gstatic.com/s/sacramento/v15/buEzpo6gcdjy0EiZMBUG0CoV_NxLeiw.ttf',
};

/** Sayfa başına serbest konum override. Anahtar 1-tabanlı sayfa numarası (string). */
export type StampPositionOverrides = Record<string, { x: number; y: number }>;

interface StampPDFOptions {
  /** Orijinal PDF'in Storage path'i (request-documents bucket'ında) */
  originalPdfPath: string;
  /** Kaşe görselinin Storage path'i (stamps bucket'ında) */
  stampImagePath: string;
  /** Kaşe boyutları (px) */
  stampWidth: number;
  stampHeight: number;
  /** Kaşenin konumu (preset — yeni ratio alanları boş ise fallback) */
  stampPosition: StampPosition;
  /** Hangi sayfalara kaşe basılacak: "all" veya "1,3,5" */
  selectedPages: string;
  /** Serbest konum default: UI top-left origin, 0-1 normalized (sayfa genişliğine/yüksekliğine oran) */
  stampXRatio?: number | null;
  stampYRatio?: number | null;
  /** Sayfa bazlı override map: { "2": { x, y }, "5": { x, y } } — override olmayan sayfalar default ratio kullanır */
  stampPositionOverrides?: StampPositionOverrides | null;
  /** GM'in imza metni (kaşenin üstüne yazılır, canvas imzası yoksa kullanılır) */
  signatureText?: string;
  /** GM'in imza font'u */
  signatureFont?: string;
  /** GM'in canvas'tan çizdiği imza (data URL - PNG) */
  signatureImageDataUrl?: string;
}

/**
 * PDF'e kaşe görseli ve imza metni overlay eder.
 *
 * 1. Storage'dan orijinal PDF'i ve kaşe PNG'sini indirir
 * 2. Seçilen sayfalara kaşeyi çizer
 * 3. İmza metni varsa kaşenin üstüne yazar
 * 4. Kaşelenmiş PDF Buffer'ını döndürür
 */
export async function stampPDF(options: StampPDFOptions): Promise<Buffer> {
  const {
    originalPdfPath,
    stampImagePath,
    stampWidth,
    stampHeight,
    stampPosition,
    selectedPages,
    stampXRatio,
    stampYRatio,
    stampPositionOverrides,
    signatureText,
    signatureFont,
    signatureImageDataUrl,
  } = options;

  // Default ratio yalnızca x ve y birlikte sağlandığında geçerli
  const defaultRatio =
    typeof stampXRatio === 'number' && typeof stampYRatio === 'number'
      ? { x: stampXRatio, y: stampYRatio }
      : null;

  const supabaseAdmin = createServiceRoleClient();

  // 1. Orijinal PDF'i indir
  const { data: pdfBlob, error: pdfError } = await supabaseAdmin.storage
    .from('request-documents')
    .download(originalPdfPath);

  if (pdfError || !pdfBlob) {
    throw new Error(`Orijinal PDF indirilemedi: ${pdfError?.message}`);
  }

  // 2. Kaşe PNG'sini indir
  // stampImagePath DB'de "/stamps/NOY_ENERJI.png" veya "stamps/rt-enerji-kase.png" gibi kaydediliyor
  // .from('stamps') zaten bucket'ı belirtiyor, prefix'i kaldırıyoruz
  let stampFileKey = stampImagePath;
  if (stampFileKey.startsWith('/')) {
    stampFileKey = stampFileKey.slice(1);
  }
  if (stampFileKey.startsWith('stamps/')) {
    stampFileKey = stampFileKey.slice('stamps/'.length);
  }
  const { data: stampBlob, error: stampError } = await supabaseAdmin.storage
    .from('stamps')
    .download(stampFileKey);

  if (stampError || !stampBlob) {
    throw new Error(`Kaşe görseli indirilemedi: ${stampError?.message}`);
  }

  // 3. PDF'i yükle
  const pdfBytes = await pdfBlob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // fontkit kaydet (custom font embed için gerekli)
  pdfDoc.registerFontkit(fontkit);

  // 4. Kaşe PNG'sini embed et
  const stampBytes = await stampBlob.arrayBuffer();
  const stampImage = await pdfDoc.embedPng(new Uint8Array(stampBytes));

  // 5. İmza görseli veya font'unu embed et
  let sigFont: Awaited<ReturnType<typeof pdfDoc.embedFont>> | undefined;
  let sigImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | undefined;
  const SIG_FONT_SIZE = 16;

  // Canvas'tan çizilmiş imza varsa PNG olarak embed et
  if (signatureImageDataUrl) {
    try {
      const base64Data = signatureImageDataUrl.split(',')[1];
      const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      sigImage = await pdfDoc.embedPng(sigBytes);
    } catch (err) {
      console.warn('Canvas imza görseli embed edilemedi:', err);
    }
  }

  // Canvas imzası yoksa font-based imza kullan (fallback)
  if (!sigImage && signatureText) {
    const fontName = (signatureFont as SignatureFont) || DEFAULT_SIGNATURE_FONT;
    const fontUrl = SIGNATURE_FONT_URLS[fontName];
    try {
      const fontResponse = await fetch(fontUrl);
      const fontArrayBuffer = await fontResponse.arrayBuffer();
      sigFont = await pdfDoc.embedFont(fontArrayBuffer);
    } catch (err) {
      console.warn('İmza fontu yüklenemedi, standart font kullanılacak:', err);
      sigFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
  }

  // 6. Hangi sayfalar?
  const totalPages = pdfDoc.getPageCount();
  const pageIndices = parseSelectedPages(selectedPages, totalPages);

  // 7. Her sayfaya kaşe + imza bas
  const MARGIN = 30; // Sayfa kenarından boşluk

  for (const pageIndex of pageIndices) {
    const page = pdfDoc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Kaşe konumunu hesapla (override → default ratio → preset fallback)
    const { x, y } = resolveStampPosition({
      pageNumber: pageIndex + 1,
      pageWidth,
      pageHeight,
      stampWidth,
      stampHeight,
      preset: stampPosition,
      defaultRatio,
      overrides: stampPositionOverrides ?? null,
      margin: MARGIN,
    });

    // Kaşeyi çiz
    page.drawImage(stampImage, {
      x,
      y,
      width: stampWidth,
      height: stampHeight,
      opacity: 0.75,
    });

    // İmza: Canvas görseli varsa PNG olarak, yoksa text olarak bas
    if (sigImage) {
      // WYSIWYG: İmza kanvası kaşe oranında ve KIRPILMADAN (tüm kanvas) yakalanıyor.
      // Bu yüzden imzayı doğrudan kaşenin tam alanına (1:1) basıyoruz — GM kaşenin
      // neresine çizdiyse belgede de aynı konum ve boyutta çıkar. Kanvasın saydam
      // arka planı sayesinde yalnızca imza çizgileri kaşenin üzerine biner.
      page.drawImage(sigImage, {
        x,
        y,
        width: stampWidth,
        height: stampHeight,
        opacity: 1.0,
      });
    } else if (signatureText && sigFont) {
      // Font-based imza (fallback)
      const textWidth = sigFont.widthOfTextAtSize(signatureText, SIG_FONT_SIZE);
      const sigX = x + (stampWidth - textWidth) / 2;
      const sigY = y + (stampHeight - SIG_FONT_SIZE) / 2;

      page.drawText(signatureText, {
        x: sigX,
        y: sigY,
        size: SIG_FONT_SIZE,
        font: sigFont,
        color: rgb(0, 0, 0.4),
      });
    }
  }

  // 7. Kaşelenmiş PDF'i kaydet
  const stampedBytes = await pdfDoc.save();
  return Buffer.from(stampedBytes);
}

/**
 * "all" veya "1,3,5" formatındaki sayfa seçimini 0-based index dizisine çevirir
 */
function parseSelectedPages(selected: string, totalPages: number): number[] {
  if (selected === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  return selected
    .split(',')
    .map(s => parseInt(s.trim(), 10) - 1) // 1-based → 0-based
    .filter(i => i >= 0 && i < totalPages);
}

/**
 * Kaşe konumunu sayfa boyutlarına göre hesaplar
 */
function calculateStampPosition(
  position: StampPosition,
  pageWidth: number,
  pageHeight: number,
  stampW: number,
  stampH: number,
  margin: number
): { x: number; y: number } {
  switch (position) {
    case 'top-left':
      return { x: margin, y: pageHeight - margin - stampH };
    case 'top-right':
      return { x: pageWidth - margin - stampW, y: pageHeight - margin - stampH };
    case 'bottom-left':
      return { x: margin, y: margin + 20 }; // +20 imza metni için yer
    case 'bottom-right':
      return { x: pageWidth - margin - stampW, y: margin + 20 };
    case 'center':
      return { x: (pageWidth - stampW) / 2, y: (pageHeight - stampH) / 2 };
    default:
      return { x: pageWidth - margin - stampW, y: margin + 20 };
  }
}

/**
 * Bir sayfa için kaşe konumunu belirler. Öncelik sırası:
 *   1) Sayfa için override varsa onun ratio'su
 *   2) Yoksa default ratio (tüm sayfalar için)
 *   3) Hiçbiri yoksa eski preset (calculateStampPosition)
 *
 * Ratio değerleri UI top-left origin (0-1). Fonksiyon, pdf-lib'in bottom-left
 * origin koordinat sistemine çevirir ve sonucu sayfa sınırlarına clamp'ler.
 */
function resolveStampPosition(params: {
  pageNumber: number; // 1-based
  pageWidth: number;
  pageHeight: number;
  stampWidth: number;
  stampHeight: number;
  preset: StampPosition;
  defaultRatio: { x: number; y: number } | null;
  overrides: StampPositionOverrides | null;
  margin: number;
}): { x: number; y: number } {
  const override = params.overrides?.[String(params.pageNumber)];
  const ratio =
    override && typeof override.x === 'number' && typeof override.y === 'number'
      ? override
      : params.defaultRatio;

  let x: number;
  let y: number;

  if (ratio) {
    // UI top-left (kaşenin sol-üst köşesi) → PDF bottom-left (kaşenin sol-alt köşesi)
    x = ratio.x * params.pageWidth;
    y = params.pageHeight - ratio.y * params.pageHeight - params.stampHeight;
  } else {
    const preset = calculateStampPosition(
      params.preset,
      params.pageWidth,
      params.pageHeight,
      params.stampWidth,
      params.stampHeight,
      params.margin
    );
    x = preset.x;
    y = preset.y;
  }

  // Sayfa sınırına clamp — kaşe taşarsa kenara yapıştırılır
  x = Math.max(0, Math.min(x, params.pageWidth - params.stampWidth));
  y = Math.max(0, Math.min(y, params.pageHeight - params.stampHeight));

  return { x, y };
}
