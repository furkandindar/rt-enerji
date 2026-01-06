-- Supabase Storage Bucket ve RLS Politikaları
-- request-documents bucket'ı için

-- 1. Bucket oluştur (Supabase Dashboard'dan manuel olarak oluşturulmalı)
-- Bucket adı: request-documents
-- Public: false
-- Allowed MIME types: application/pdf
-- File size limit: 10MB

-- 2. Önce mevcut politikaları sil (varsa)
DROP POLICY IF EXISTS "Users can view related request PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Only service role can delete PDFs" ON storage.objects;

-- 3. Storage RLS Politikalarını Oluştur
-- Bu politikalar, sadece ilgili kişilerin PDF'leri görebilmesini sağlar

-- SELECT Policy: Kullanıcılar kendi taleplerinin veya onayladıkları taleplerin PDF'lerini görebilir
CREATE POLICY "Users can view related request PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'request-documents' 
  AND (
    -- Talep sahibi kontrolü
    EXISTS (
      SELECT 1 FROM public.app_users au
      JOIN public.employees e ON e.id = au.employee_id
      JOIN public.requests r ON r.requester_employee_id = e.id
      WHERE au.id = auth.uid()
      AND r.pdf_path = name
    )
    -- VEYA onaylayan kontrolü
    OR EXISTS (
      SELECT 1 FROM public.app_users au
      JOIN public.employees e ON e.id = au.employee_id
      JOIN public.request_approvals ra ON ra.approver_employee_id = e.id
      JOIN public.requests r ON r.id = ra.request_id
      WHERE au.id = auth.uid()
      AND r.pdf_path = name
    )
  )
);

-- INSERT Policy: Sadece service_role yükleyebilir (API tarafından kullanılacak)
-- Server-side PDF oluşturma işlemi service_role ile yapılır
CREATE POLICY "Service role can upload PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'request-documents'
  AND auth.role() = 'service_role'
);

-- UPDATE Policy: Sadece service_role güncelleyebilir
CREATE POLICY "Service role can update PDFs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'request-documents'
  AND auth.role() = 'service_role'
);

-- DELETE Policy: Sadece service_role silebilir (güvenlik için)
CREATE POLICY "Service role can delete PDFs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'request-documents'
  AND auth.role() = 'service_role'
);

-- Not: Bu SQL dosyasını çalıştırmadan önce, Supabase Dashboard'dan
-- 'request-documents' bucket'ını manuel olarak oluşturmanız gerekir.
-- 
-- Bucket Ayarları:
-- - Name: request-documents
-- - Public: false (RLS ile kontrol edilecek)
-- - File size limit: 10485760 (10MB)
-- - Allowed MIME types: application/pdf

