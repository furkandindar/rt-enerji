import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StampPosition } from '@/lib/workflow/types';
import { SignatureFont, DEFAULT_SIGNATURE_FONT } from '@/lib/signature/types';

// İmza font URL'leri (Google Fonts TTF)
const SIGNATURE_FONT_URLS: Record<SignatureFont, string> = {
  'Ballet': 'https://fonts.gstatic.com/s/ballet/v27/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3C4G-EiAou6Y.ttf',
  'Great Vibes': 'https://fonts.gstatic.com/s/greatvibes/v18/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf',
  'Sacramento': 'https://fonts.gstatic.com/s/sacramento/v15/buEzpo6gcdjy0EiZMBUG0CoV_NxLeiw.ttf',
};

interface StampPDFOptions {
  /** Orijinal PDF'in Storage path'i (request-documents bucket'ında) */
  originalPdfPath: string;
  /** Kaşe görselinin Storage path'i (stamps bucket'ında) */
  stampImagePath: string;
  /** Kaşe boyutları (px) */
  stampWidth: number;
  stampHeight: number;
  /** Kaşenin konumu */
  stampPosition: StampPosition;
  /** Hangi sayfalara kaşe basılacak: "all" veya "1,3,5" */
  selectedPages: string;
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
    signatureText,
    signatureFont,
    signatureImageDataUrl,
  } = options;

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
      sigFont = await pdfDoc.embedFont('Helvetica' as any);
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

    // Kaşe konumunu hesapla
    const { x, y } = calculateStampPosition(
      stampPosition,
      pageWidth,
      pageHeight,
      stampWidth,
      stampHeight,
      MARGIN
    );

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
      // Canvas imzasını kaşenin üstüne çiz
      const sigDims = sigImage.scale(1);
      const maxSigWidth = stampWidth * 0.8;
      const maxSigHeight = stampHeight * 0.5;
      const scale = Math.min(maxSigWidth / sigDims.width, maxSigHeight / sigDims.height, 1);
      const finalSigWidth = sigDims.width * scale;
      const finalSigHeight = sigDims.height * scale;
      const sigX = x + (stampWidth - finalSigWidth) / 2;
      const sigY = y + (stampHeight - finalSigHeight) / 2;

      page.drawImage(sigImage, {
        x: sigX,
        y: sigY,
        width: finalSigWidth,
        height: finalSigHeight,
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

