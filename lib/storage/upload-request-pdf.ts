import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

interface UploadPDFOptions {
  requestId: string;
  pdfBuffer: Buffer;
  supabase?: SupabaseClient; // Optional - service role kullanılacak
}

/**
 * PDF'i Supabase Storage'a yükler
 * Service role client kullanır (RLS bypass)
 * @param options - requestId, pdfBuffer
 * @returns Storage path
 */
export async function uploadRequestPDF(
  options: UploadPDFOptions
): Promise<string> {
  const { requestId, pdfBuffer } = options;

  // Service role client kullan - RLS bypass için
  const supabaseAdmin = createServiceRoleClient();

  // Dosya yolu oluştur: request-documents/YYYY/MM/request-id_approval.pdf
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fileName = `${requestId}_approval.pdf`;
  const filePath = `${year}/${month}/${fileName}`;

  // Storage'a yükle (service role client ile - RLS bypass)
  const { data, error } = await supabaseAdmin.storage
    .from('request-documents')
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true, // Aynı dosya varsa üzerine yaz
    });

  if (error) {
    console.error('Error uploading PDF to storage:', error);
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }

  return filePath;
}

/**
 * Storage'dan PDF'i getirir
 * @param filePath - Storage'daki dosya yolu
 * @param supabase - Supabase client
 * @returns PDF blob
 */
export async function downloadRequestPDF(
  filePath: string,
  supabase: SupabaseClient
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from('request-documents')
    .download(filePath);

  if (error) {
    console.error('Error downloading PDF from storage:', error);
    throw new Error(`Failed to download PDF: ${error.message}`);
  }

  return data;
}

/**
 * Storage'dan PDF'in public URL'ini alır
 * @param filePath - Storage'daki dosya yolu
 * @param supabase - Supabase client
 * @returns Public URL (signed URL)
 */
export async function getRequestPDFUrl(
  filePath: string,
  supabase: SupabaseClient,
  expiresIn: number = 3600 // 1 saat
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('request-documents')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    console.error('Error creating signed URL:', error);
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

