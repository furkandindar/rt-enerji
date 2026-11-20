-- =====================================================================
-- Gizli Süper Admin + sistem hesabı (2/2): PROD hesabı — 2026-11-20
-- =====================================================================
-- YALNIZ PROD, feature_super_admin_1_schema.sql + kod deploy'undan SONRA.
-- (Dev'de deneme.admin dev'in Genel Müdür pozisyonundadır; uygulanmaz.)
--
-- Geliştirici hesabı (deneme.admin@rtenerji.com, eski adı "Admin Test"):
--   1. Rol ORG_ADMIN → SUPER_ADMIN (gizli; Kullanıcılar ve Roller'de görünmez).
--   2. Çalışan kaydı sistem kaydı olur, adı "Sistem Yöneticisi" (müdahale ettiğinde
--      geçmişte bu ad görünür); listelerden/seçicilerden/şemadan süzülür.
--   3. "Yönetim Kurulu Başkanı" pozisyon ataması sonlandırılır (pozisyon boş kalır).
--      Etki: Genel Müdür'ün kendi taleplerinde UNIT_HEAD ("Bölüm Müdürü") adımı artık
--      bu hesaba tırmanmaz; en üste ulaşınca Genel Müdür'ün kendisine çözülür ve GM
--      zincirin ileriki adımında olduğu için adım hiç oluşmaz (mükerrer onaycı skip).
--      Bugüne dek 4 talep bu hesaba düşmüştü (3 onay, 1 iptal); açık talep yok.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_uid uuid;
  v_emp uuid;
  n int;
BEGIN
  SELECT id, employee_id INTO v_uid, v_emp
  FROM public.app_users WHERE email = 'deneme.admin@rtenerji.com';
  IF v_uid IS NULL OR v_emp IS NULL THEN
    RAISE EXCEPTION 'Geliştirici hesabı / çalışan kaydı bulunamadı';
  END IF;

  -- Açık (işlemde) bir onayı varsa dur: önce o devredilmeli.
  IF EXISTS (
    SELECT 1 FROM public.request_approvals ra
    JOIN public.requests r ON r.id = ra.request_id
    WHERE ra.approver_employee_id = v_emp AND ra.status = 'PENDING'
      AND r.status IN ('PENDING', 'AWAITING_COMPLETION')
  ) THEN
    RAISE EXCEPTION 'Hesabın bekleyen açık onayı var; önce devredilmeli';
  END IF;

  UPDATE public.employees
     SET first_name = 'Sistem', last_name = 'Yöneticisi', is_system = true
   WHERE id = v_emp;

  UPDATE public.employee_positions
     SET end_date = current_date
   WHERE employee_id = v_emp AND end_date IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Sonlandırılan pozisyon ataması: %', n;

  PERFORM set_config('app.role_change_reason', 'Sistem hesabı: gizli Süper Admin (geliştirici)', true);
  UPDATE public.app_users SET role = 'SUPER_ADMIN' WHERE id = v_uid;

  IF EXISTS (SELECT 1 FROM public.employee_positions WHERE employee_id = v_emp AND end_date IS NULL) THEN
    RAISE EXCEPTION 'Aktif pozisyon ataması kaldı';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- PROD (iiagqsbiexyukupkffwb): 2026-11-20 uygulandı (deploy 52a4f35 sonrası). Doğrulama:
--   rol SUPER_ADMIN (10 izin, 2.338 talebin tamamını görür, Müdür değil); kayıt "Sistem
--   Yöneticisi", is_system, aktif pozisyon 0; Yönetim Kurulu Başkanı pozisyonu boş;
--   @bahsetme adaylarında yok. Görünür roller: Admin = Genel Müdür; Yönetici = 2 kişi.
-- =====================================================================
