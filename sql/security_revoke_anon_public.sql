-- ============================================================================
-- GÜVENLİK: giriş yapmamış (anon) erişimi public şemasında kapatılır
-- ============================================================================
--
-- Bulgu (2026-11-11, prod'da doğrulandı): tarayıcıda zaten açık olan publishable
-- (anon) anahtarla, giriş yapmadan PostgREST'e doğrudan istek atan biri
--   - requests: 1.521 satır (talep no, süreç, talep eden, durum, pdf_path),
--   - request_approvals: 6.489 satır (onaycılar, kararlar, ONAY YORUMLARI),
--   - request_attachments: 688 satır (dosya adları)
-- okuyabiliyordu. Sebep: Supabase varsayılanı anon'a tablo yetkisi verir;
-- requests_select'teki "kısıtsız süreç herkese açık" dalı auth.uid() NULL iken de
-- true döner. Ayrıca SECURITY DEFINER fonksiyonlar anon'a açıktı — özellikle
-- create_notification ile girişsiz biri herhangi bir kullanıcıya uygulama içi
-- bildirim yazabiliyordu.
--
-- Uygulama public şemasına hiç girişsiz erişmez: prod edge loglarında 24 saatte
-- OPTIONS (CORS ön kontrol) dışında anon REST isteği 0. Tüm uygulama istekleri
-- authenticated veya service_role ile gelir.
--
-- Değişiklik:
--   1) anon'un public tablo/view/sequence yetkileri kaldırılır.
--   2) anon'un çalıştırabildiği fonksiyonlarda (trigger hariç) PUBLIC + anon
--      EXECUTE kaldırılır; authenticated ve service_role'ün BUGÜNKÜ yetkisi aynen
--      korunur (önce okunur, varsa açıkça yeniden verilir — hiçbir fonksiyon
--      genişlemez, ör. employees_who_can_view_request yalnız service_role kalır).
--   3) İleride oluşturulacak nesneler varsayılan olarak anon'a açılmaz.
-- authenticated / service_role davranışı DEĞİŞMEZ.
--
-- Önce DEV, sonra PROD.
-- DEV + PROD: 2026-11-11 uygulandı. Doğrulama: anon tablo yetkisi 300 → 0, anon
-- fonksiyon yetkisi 14 → 0; authenticated/service_role yetki özetleri önce/sonra
-- birebir aynı; anon REST/RPC denemeleri 401/42501; e2e 80/80.
-- ============================================================================

BEGIN;

-- 1) Tablolar, view'lar, sequence'lar
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 2) Fonksiyonlar
DO $$
DECLARE
  f record;
  v_auth boolean;
  v_service boolean;
  v_count int := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_function_result(p.oid) <> 'trigger'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    v_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', f.oid, 'EXECUTE');

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    IF v_service THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'anon EXECUTE kaldırıldı: % fonksiyon', v_count;
END $$;

-- 3) Gelecekteki nesneler
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

COMMIT;

-- ----------------------------------------------------------------------------
-- Doğrulama (salt okuma)
-- ----------------------------------------------------------------------------
-- anon tablo yetkisi kalmadı mı?           (0 beklenir)
-- SELECT count(*) FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND grantee = 'anon';
-- anon'un çalıştırabildiği fonksiyon kaldı mı? (trigger hariç 0 beklenir)
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prokind = 'f'
--    AND pg_get_function_result(p.oid) <> 'trigger'
--    AND has_function_privilege('anon', p.oid, 'EXECUTE');
