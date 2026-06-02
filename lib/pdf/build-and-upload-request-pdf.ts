import { SupabaseClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import { generateRequestPDF } from './generate-request-pdf';
import { mergeAttachments } from './merge-attachments';
import { uploadRequestPDF } from '@/lib/storage/upload-request-pdf';
import { enqueueSharePointSync } from '@/lib/sharepoint/enqueue-sync';

interface BuildAndUploadOptions {
  requestId: string;
  supabase: SupabaseClient;
  /**
   * true ise üretilen PDF path'i requests.pdf_path kolonuna yazılır.
   * Default: true
   */
  persistPdfPath?: boolean;
}

/**
 * Talep için PDF üretir, attachment'ları birleştirir, Storage'a yükler ve
 * (opsiyonel) requests.pdf_path kolonunu günceller.
 *
 * Onaylanan / reddedilen / tamamlanan talepler için tek noktadan kullanılabilir.
 *
 * @returns Storage'a yüklenen PDF'in path'i
 */
export async function buildAndUploadRequestPDF(
  options: BuildAndUploadOptions
): Promise<string> {
  const { requestId, supabase, persistPdfPath = true } = options;

  let pdfPath: string;
  let finalPdfBuffer: Buffer;

  try {
    const pdfBuffer = await generateRequestPDF({ requestId, supabase });
    finalPdfBuffer = await mergeAttachments(pdfBuffer, requestId, supabase);
    pdfPath = await uploadRequestPDF({ requestId, pdfBuffer: finalPdfBuffer });
  } catch (err) {
    // PDF üretim hatası — caller'a fırlatmadan önce requests.pdf_status'u
    // 'failed' işaretle ki "approved ama PDF yok" zombi'leri birikmesin.
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('requests')
      .update({ pdf_status: 'failed', pdf_last_error: message })
      .eq('id', requestId);
    throw err;
  }

  if (persistPdfPath) {
    const { error } = await supabase
      .from('requests')
      .update({
        pdf_path: pdfPath,
        pdf_status: 'success',
        pdf_last_error: null,
      })
      .eq('id', requestId);

    if (error) {
      console.error('Failed to persist pdf_path on requests row:', error);
    }
  }

  // SharePoint sync — killswitch env içinde. Vercel serverless runtime'ı response
  // sonrası kapatır; `after()` ile runtime açık kalır ve upload tamamlanır.
  after(async () => {
    try {
      await enqueueSharePointSync({
        requestId,
        pdfBuffer: finalPdfBuffer,
        supabasePdfPath: pdfPath,
      });
    } catch (err) {
      console.error('[sharepoint-enqueue] enqueue başarısız:', err);
    }
  });

  return pdfPath;
}
