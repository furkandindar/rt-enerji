-- ============================================================================
-- GÜVENLİK SERTLEŞTİRME: trigger fonksiyonları + sabit search_path
-- ============================================================================
--
-- Supabase security advisor (2026-11-11, security_revoke_anon_public.sql sonrası):
--   - anon_security_definer_function_executable: 4 trigger fonksiyonu
--     (assign_request_no, handle_auth_user_created, handle_employee_link_app_user,
--     log_workflow_step_change) PUBLIC üzerinden RPC'ye açık görünüyordu.
--     Trigger fonksiyonları doğrudan çağrılamaz (Postgres hata verir) ve tetiklenmeleri
--     EXECUTE yetkisi gerektirmez — dev'de sentetik testle doğrulandı (yetkisiz rolün
--     INSERT'ü trigger'ı yine tetikledi). Bu yüzden PUBLIC/anon/authenticated EXECUTE
--     kaldırılır; davranış değişmez (auth.users → handle_auth_user_created dahil).
--   - function_search_path_mutable: 4 fonksiyonda search_path sabitlenir. Gövdeler
--     zaten public.* / auth.* nitelikli; sonuç aynı, yalnız arama yolu manipülasyonu
--     kapanır.
--
-- Önce DEV, sonra PROD.
-- DEV + PROD: 2026-11-11 uygulandı; e2e 80/80; advisor anon_security_definer 4 → 0,
-- function_search_path_mutable 4 → 0.
-- ============================================================================

BEGIN;

DO $$
DECLARE f record; v_count int := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'trigger fonksiyonu: %', v_count;
END $$;

ALTER FUNCTION public.get_current_employee_id() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.create_mukayese_request(uuid, uuid, jsonb, jsonb, jsonb, jsonb) SET search_path = public;

COMMIT;
