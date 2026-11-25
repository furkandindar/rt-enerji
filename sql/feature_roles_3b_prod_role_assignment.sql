-- =====================================================================
-- Rol matrisi v2 (2/2): PROD rol ataması — 2026-11-25
-- =====================================================================
-- YALNIZ PROD, feature_roles_3_role_matrix_v2.sql'den SONRA.
-- Genel Müdür'ün rol tablosundaki "Bilgi İşlem Uzmanı" sütunu Bilgi İşlem
-- Departmanı'nın tek çalışanı içindir: Yönetici → Bilgi İşlem Uzmanı (ORG_IT).
-- Etki: organizasyon/kaşe/vekalet yönetimi ve (v2 ile gelen) Yönetici izinleri
-- kalkar; teknik araçlar + süreç tanımlarını görme kalır. Talep görünürlüğü
-- değişmez (iki rolde de talep izni yoktu; onaycısı olduğu talepler aynen).
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_uid uuid;
BEGIN
  -- STRICT: hiç yoksa veya birden fazlaysa hata (tek kişi bekleniyor).
  SELECT DISTINCT au.id INTO STRICT v_uid
  FROM public.app_users au
  JOIN public.employee_positions ep ON ep.employee_id = au.employee_id AND ep.end_date IS NULL
  JOIN public.positions p ON p.id = ep.position_id
  JOIN public.organizational_units ou ON ou.id = p.unit_id
  WHERE ou.code = 'BID' AND au.role = 'ORG_MANAGER';

  PERFORM set_config('app.role_change_reason',
    'Genel Müdür rol tablosu (2026-11-25): Bilgi İşlem Uzmanı', true);
  UPDATE public.app_users SET role = 'ORG_IT' WHERE id = v_uid;
END $$;

COMMIT;

-- PROD (iiagqsbiexyukupkffwb): 2026-11-25 uygulandı. my_access: ORG_IT, 2 izin
-- (integrations.manage, workflows.view), birim kapsamı yok; rol geçmişine gerekçeyle yazıldı.
