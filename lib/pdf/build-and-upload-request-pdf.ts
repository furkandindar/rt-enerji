import { SupabaseClient } from '@supabase/supabase-js';
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

  const pdfBuffer = await generateRequestPDF({ requestId, supabase });
  const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestId, supabase);
  const pdfPath = await uploadRequestPDF({ requestId, pdfBuffer: finalPdfBuffer });

  if (persistPdfPath) {
    const { error } = await supabase
      .from('requests')
      .update({ pdf_path: pdfPath })
      .eq('id', requestId);

    if (error) {
      console.error('Failed to persist pdf_path on requests row:', error);
    }
  }

  // SharePoint sync — killswitch env içinde, fire-and-forget. PDF akışını bloklamaz.
  void enqueueSharePointSync({
    requestId,
    pdfBuffer: finalPdfBuffer,
    supabasePdfPath: pdfPath,
  }).catch((err) => {
    console.error('[sharepoint-enqueue] enqueue başarısız:', err);
  });

  return pdfPath;
}
