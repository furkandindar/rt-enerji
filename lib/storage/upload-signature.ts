import { SupabaseClient } from '@supabase/supabase-js';

interface UploadSignatureOptions {
  employeeId: string;
  signatureDataUrl: string; // Canvas'tan gelen base64 data URL
  supabase: SupabaseClient;
}

/**
 * Kullanıcının imzasını Supabase Storage'a yükler
 * @param options - employeeId, signatureDataUrl ve supabase client
 * @returns Storage path
 */
export async function uploadSignature(
  options: UploadSignatureOptions
): Promise<string> {
  const { employeeId, signatureDataUrl, supabase } = options;

  // Data URL'den blob oluştur
  const base64Data = signatureDataUrl.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });

  // Dosya adı: employee-id.png
  const fileName = `${employeeId}.png`;

  // Storage'a yükle
  const { data, error } = await supabase.storage
    .from('signatures')
    .upload(fileName, blob, {
      contentType: 'image/png',
      upsert: true, // Varsa üzerine yaz
    });

  if (error) {
    console.error('Error uploading signature:', error);
    throw new Error(`Failed to upload signature: ${error.message}`);
  }

  return fileName;
}

/**
 * Kullanıcının imzasını Storage'dan siler
 * @param employeeId - Employee ID
 * @param supabase - Supabase client
 */
export async function deleteSignature(
  employeeId: string,
  supabase: SupabaseClient
): Promise<void> {
  const fileName = `${employeeId}.png`;

  const { error } = await supabase.storage
    .from('signatures')
    .remove([fileName]);

  if (error) {
    console.error('Error deleting signature:', error);
    throw new Error(`Failed to delete signature: ${error.message}`);
  }
}

/**
 * İmza için public URL oluşturur
 * @param employeeId - Employee ID
 * @param supabase - Supabase client
 * @returns Public URL veya null
 */
export async function getSignatureUrl(
  employeeId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const fileName = `${employeeId}.png`;

  // Dosya var mı kontrol et
  const { data: files } = await supabase.storage
    .from('signatures')
    .list('', {
      search: fileName,
    });

  if (!files || files.length === 0) {
    return null;
  }

  // Signed URL oluştur (1 saat geçerli)
  const { data } = await supabase.storage
    .from('signatures')
    .createSignedUrl(fileName, 3600);

  return data?.signedUrl || null;
}

/**
 * PDF için imza buffer'ı indir
 * @param employeeId - Employee ID
 * @param supabase - Supabase client
 * @returns Image buffer veya null
 */
export async function getSignatureBuffer(
  employeeId: string,
  supabase: SupabaseClient
): Promise<Buffer | null> {
  const fileName = `${employeeId}.png`;

  const { data, error } = await supabase.storage
    .from('signatures')
    .download(fileName);

  if (error || !data) {
    console.log(`No signature found for employee ${employeeId}`);
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

