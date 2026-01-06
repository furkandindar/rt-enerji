-- İmza Sistemi - Faz 1
-- employees tablosuna dijital imza alanı ekleme

-- 1. signature_path alanı ekle
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS signature_path TEXT;

COMMENT ON COLUMN public.employees.signature_path IS 'Kullanıcının dijital imza görüntüsünün Storage path''i (signatures/employee-id.png)';

-- 2. Supabase Storage Bucket Oluşturma Talimatları
-- 
-- Supabase Dashboard > Storage > Create a new bucket
-- 
-- Bucket Ayarları:
-- - Name: signatures
-- - Public: false (RLS ile kontrol edilecek)
-- - File size limit: 1048576 (1MB - imza için yeterli)
-- - Allowed MIME types: image/png, image/jpeg
--
-- RLS Politikaları aşağıda tanımlanmıştır.

-- 3. Storage RLS Politikaları

-- SELECT Policy: Kullanıcılar kendi imzalarını ve ilgili oldukları taleplerdeki imzaları görebilir
DROP POLICY IF EXISTS "Users can view signatures" ON storage.objects;
CREATE POLICY "Users can view signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures' 
  AND (
    -- Kendi imzası
    name = (
      SELECT e.id::text || '.png'
      FROM public.app_users au
      JOIN public.employees e ON e.id = au.employee_id
      WHERE au.id = auth.uid()
    )
    -- VEYA ilgili olduğu taleplerdeki imzalar
    OR EXISTS (
      SELECT 1 FROM public.app_users au
      JOIN public.employees e ON e.id = au.employee_id
      WHERE au.id = auth.uid()
      AND (
        -- Talep sahibinin imzası
        EXISTS (
          SELECT 1 FROM public.requests r
          WHERE r.requester_employee_id = e.id
          AND name LIKE '%' || r.requester_employee_id::text || '.png'
        )
        -- VEYA onaylayanların imzaları
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          WHERE ra.approver_employee_id = e.id
          AND name LIKE '%' || ra.approver_employee_id::text || '.png'
        )
      )
    )
  )
);

-- INSERT/UPDATE Policy: Kullanıcılar sadece kendi imzalarını yükleyebilir/güncelleyebilir
DROP POLICY IF EXISTS "Users can upload own signature" ON storage.objects;
CREATE POLICY "Users can upload own signature"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signatures'
  AND name = (
    SELECT e.id::text || '.png'
    FROM public.app_users au
    JOIN public.employees e ON e.id = au.employee_id
    WHERE au.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own signature" ON storage.objects;
CREATE POLICY "Users can update own signature"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signatures'
  AND name = (
    SELECT e.id::text || '.png'
    FROM public.app_users au
    JOIN public.employees e ON e.id = au.employee_id
    WHERE au.id = auth.uid()
  )
);

-- DELETE Policy: Kullanıcılar kendi imzalarını silebilir
DROP POLICY IF EXISTS "Users can delete own signature" ON storage.objects;
CREATE POLICY "Users can delete own signature"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'signatures'
  AND name = (
    SELECT e.id::text || '.png'
    FROM public.app_users au
    JOIN public.employees e ON e.id = au.employee_id
    WHERE au.id = auth.uid()
  )
);

-- Not: Bu SQL dosyasını çalıştırmadan önce, Supabase Dashboard'dan
-- 'signatures' bucket'ını manuel olarak oluşturmanız gerekir.

-- 4. Mevcut imzaları olan çalışanların signature_path'ini güncelle
-- Storage'da imzası olan çalışanlar için çalıştırın:
-- (Storage'daki dosya listesine bakarak employee_id'leri belirleyin)
/*
UPDATE public.employees
SET signature_path = id::text || '.png'
WHERE id IN (
  -- Buraya storage'da imzası olan employee_id'leri ekleyin
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy'
);
*/
