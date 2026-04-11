import { PDFDocument } from 'pdf-lib';
import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Workflow PDF'ine ek dosyaları (attachment) birleştirir.
 * 
 * Süreç tamamlandığında (son adım onaylandığında) çağrılır.
 * Ana PDF'in sonuna tüm ek dosya sayfalarını ekler.
 * 
 * @param workflowPdfBuffer - Ana workflow PDF'i (Buffer)
 * @param requestId - Talep ID'si
 * @param supabase - Supabase client (DB sorguları için)
 * @returns Birleştirilmiş PDF Buffer'ı
 */
export async function mergeAttachments(
  workflowPdfBuffer: Buffer,
  requestId: string,
  supabase: SupabaseClient
): Promise<Buffer> {
  // 1. Bu request'e ait tüm ek dosyaları getir
  const { data: attachments, error } = await supabase
    .from('request_attachments')
    .select('file_path, file_name')
    .eq('request_id', requestId)
    .order('uploaded_at', { ascending: true });

  if (error) {
    console.error('Error fetching attachments for merge:', error);
    // Hata durumunda ana PDF'i döndür (merge'siz)
    return workflowPdfBuffer;
  }

  // Ek dosya yoksa direkt ana PDF'i döndür
  if (!attachments || attachments.length === 0) {
    console.log('No attachments to merge for request:', requestId);
    return workflowPdfBuffer;
  }

  console.log(`Merging ${attachments.length} attachment(s) for request:`, requestId);

  // 2. Birleşik PDF oluştur
  const mergedPdf = await PDFDocument.create();

  // Ana PDF sayfalarını ekle
  const mainDoc = await PDFDocument.load(workflowPdfBuffer);
  const mainPages = await mergedPdf.copyPages(mainDoc, mainDoc.getPageIndices());
  mainPages.forEach(page => mergedPdf.addPage(page));

  // 3. Service role client ile ek dosyaları indir (RLS bypass)
  const supabaseAdmin = createServiceRoleClient();

  // Ek dosya sayfalarını ekle
  for (const att of attachments) {
    try {
      console.log(`Downloading attachment: ${att.file_name} (${att.file_path})`);

      const { data: blob, error: downloadError } = await supabaseAdmin.storage
        .from('workflow-attachments')
        .download(att.file_path);

      if (downloadError || !blob) {
        console.error(`Error downloading attachment ${att.file_name}:`, downloadError);
        continue; // Bu dosyayı atla, diğerlerine devam et
      }

      const attBuffer = await blob.arrayBuffer();
      const attDoc = await PDFDocument.load(attBuffer);
      const attPages = await mergedPdf.copyPages(attDoc, attDoc.getPageIndices());
      attPages.forEach(page => mergedPdf.addPage(page));

      console.log(`Merged ${attPages.length} page(s) from: ${att.file_name}`);
    } catch (attError) {
      console.error(`Error merging attachment ${att.file_name}:`, attError);
      // Bu dosyayı atla, diğerlerine devam et
    }
  }

  // 4. Birleşik PDF'i döndür
  const mergedBytes = await mergedPdf.save();
  console.log('PDF merge completed. Total size:', mergedBytes.byteLength, 'bytes');

  return Buffer.from(mergedBytes);
}

