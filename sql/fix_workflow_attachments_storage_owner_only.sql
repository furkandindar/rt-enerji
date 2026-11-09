-- ============================================================================
-- GÜVENLİK: workflow-attachments bucket'ında okuma/silme yalnız yükleyene
-- ============================================================================
--
-- Bulgu (2026-11-07, İK Onay formları hazırlığında):
--   storage.objects üzerindeki iki politika bucket'taki TÜM dosyaları giriş
--   yapmış HER kullanıcıya açıyordu:
--     "Authenticated users can read workflow attachments"   (SELECT: listele + indir)
--     "Authenticated users can delete workflow attachments" (DELETE)
--   Uygulamadaki erişim kontrolleri (talep sahibi / onaycı / departman) yalnız
--   API rotalarında; Storage API'yi doğrudan çağıran biri (tarayıcı konsolu +
--   kendi oturumu) prod'daki 1.429 eki (CV, zimmet, finans belgeleri) listeleyip
--   indirebilir ve silebilirdi. Maaş içeren İK Onay formlarının ekleri ve ıslak imzalı
--   taramaları da bu bucket'a düşecek.
--
-- Uygulama bu bucket'ı nasıl kullanıyor (kod taraması):
--   - Okuma (indir/önizle/PDF'e birleştir): HEP service role → bu politikadan etkilenmez.
--   - Yükleme: imzalı yükleme URL'i (INSERT politikası) → DEĞİŞMİYOR.
--   - Silme: RLS'li istemciyle, yalnız ekin yükleyeni (request_attachments.ra_delete
--     zaten uploaded_by = ben) ve yükleme hatasında aynı kullanıcının temizliği.
--   - DELETE ... WHERE satırı okuduğu için SELECT politikası da gerekir → SELECT'i
--     tamamen kaldırmak yerine "yalnız kendi yüklediğin" yapılır.
--
-- Veri kontrolü (prod, 2026-11-07): 1.429 nesnenin hepsinde owner_id dolu;
-- DB kaydı olan 1.415'inin hepsinde owner = ekin yükleyeninin auth kullanıcısı.
-- Önce DEV'de uygula ve dene: ek yükle → sil → başkasının talebindeki eki
-- uygulamadan indir/önizle (service role, çalışmaya devam etmeli).
-- DEV: 2026-11-07 uygulandı (agent, MCP). RLS simülasyonu: deneme4 öncesi 97/97
-- nesne görüyordu, sonrası yalnız kendi 44'ü.
-- PROD: 2026-11-07 uygulandı (kullanıcı onayıyla, UI testi atlandı). RLS simülasyonu:
-- 358 dosyalık bir kullanıcı öncesi 1.429/1.429 nesne görüyordu, sonrası yalnız 358.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can read workflow attachments" ON storage.objects;
DROP POLICY IF EXISTS "workflow_attachments_select_own" ON storage.objects;
CREATE POLICY "workflow_attachments_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'workflow-attachments' AND owner_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Authenticated users can delete workflow attachments" ON storage.objects;
DROP POLICY IF EXISTS "workflow_attachments_delete_own" ON storage.objects;
CREATE POLICY "workflow_attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'workflow-attachments' AND owner_id = (SELECT auth.uid())::text);

COMMIT;

-- Doğrulama (salt okuma) — 3 politika: INSERT (eski, değişmedi), SELECT/DELETE (yeni):
-- SELECT policyname, cmd, roles, qual FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND (qual ILIKE '%workflow-attachments%' OR with_check ILIKE '%workflow-attachments%');
