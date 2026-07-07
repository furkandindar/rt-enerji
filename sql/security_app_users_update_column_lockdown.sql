-- ============================================================================
-- GÜVENLİK: app_users self-escalation açığını kapat
-- ============================================================================
--
-- SORUN:
--   `authenticated` (ve `anon`) rolü app_users üzerinde tablo geneli UPDATE
--   yetkisine sahip ve tek UPDATE politikası (app_users_update_privacy_self)
--   sadece `id = auth.uid()` kontrolü yapıyor — KOLON kısıtı yok. Postgres RLS
--   satır bazlıdır, kolon bazlı değildir. Sonuç: giriş yapmış herhangi bir
--   kullanıcı kendi satırında
--       UPDATE app_users SET role='ORG_ADMIN' WHERE id = auth.uid();
--   çalıştırıp kendini admin yapabiliyor. Bu, ORG_ADMIN'e geniş yetki veren
--   tüm RLS politikalarını (requests_select / requests_update / PDF erişimi)
--   ve service-role ile indirilen PDF'leri istismara açıyor.
--
-- ÇÖZÜM:
--   Tablo geneli UPDATE yetkisini geri al; UPDATE'i yalnızca meşru self-servis
--   kolonu olan `privacy_accepted_at` ile sınırla. role / employee_id yalnızca
--   handle_auth_user_created() SECURITY DEFINER trigger'ından yazılır (grant'ları
--   baypas eder) — bu değişiklikten etkilenmez. Uygulamadaki tek kullanıcı-client
--   yazması app/api/privacy-consent/route.ts olup sadece privacy_accepted_at
--   günceller, dolayısıyla kırılmaz.
--
-- NOT: service_role dokunulmadan kalır (GRANT ALL); tüm sunucu-tarafı akışlar
--   ve SECURITY DEFINER trigger çalışmaya devam eder.
-- ============================================================================

BEGIN;

-- 1) authenticated ve anon'dan tablo geneli UPDATE'i geri al
REVOKE UPDATE ON public.app_users FROM authenticated;
REVOKE UPDATE ON public.app_users FROM anon;

-- 2) authenticated'a yalnızca privacy_accepted_at kolonunda UPDATE ver
--    (satır bazlı kısıt hâlâ app_users_update_privacy_self RLS politikasından:
--     id = auth.uid())
GRANT UPDATE (privacy_accepted_at) ON public.app_users TO authenticated;

COMMIT;

-- ============================================================================
-- DOĞRULAMA (çalıştırdıktan sonra):
--   Beklenen sonuç: auth_role_col=false, auth_emp_col=false, auth_privacy_col=true
-- ============================================================================
-- SELECT
--   has_column_privilege('authenticated','public.app_users','role','UPDATE')                 AS auth_role_col,
--   has_column_privilege('authenticated','public.app_users','employee_id','UPDATE')          AS auth_emp_col,
--   has_column_privilege('authenticated','public.app_users','privacy_accepted_at','UPDATE')  AS auth_privacy_col,
--   has_table_privilege('service_role','public.app_users','UPDATE')                          AS svc_upd;
