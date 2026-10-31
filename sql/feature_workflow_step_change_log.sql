-- ============================================================================
-- Süreç Tanımları: adım pozisyonu değişiklik logu (2026-10-31)
-- ============================================================================
--
-- Geri bildirim: Saadet Nur Kanbur'un pozisyonu İdari İşler Personeli (İDR500)
-- → Bilgi İşlem Personeli (BID500) değişince İşe Giriş / İşten Çıkış QNAP
-- adımları boş pozisyona bağlı kaldı ve yeni talepler oluşturulamadı. Düzeltme
-- Table Editor'den elle yapıldı. Bundan sonra ORG_ADMIN'ler Süreç Tanımları
-- ekranından (/workflow-definitions) sabit pozisyonlu adımın pozisyonunu (ve
-- istenirse adım adını) kendileri değiştirebilecek.
--
-- Yazma yetkisi zaten var: workflow_steps_update_admin (ORG_ADMIN UPDATE).
-- Onay akışını değiştirdiği için (5 ORG_ADMIN var; biri akışı kendine bile
-- yönlendirebilir) her değişiklik kayıt altına alınır.
--
-- Bu script:
--   1) workflow_step_changes — adım bazlı değişiklik logu (static_position_id ve
--      name). Pozisyon başlıkları değişiklik anındaki haliyle saklanır (pozisyon
--      sonradan yeniden adlandırılsa/silinse de log okunur kalır).
--   2) AFTER UPDATE trigger — logu uygulama değil DB yazar: panelden, Table
--      Editor'den ya da SQL'den yapılan HER değişiklik aynı transaction'da
--      kaydedilir. auth.uid() panelde değişikliği yapan kullanıcıdır; Table
--      Editor / SQL'de NULL kalır (ekranda "Supabase (Table Editor / SQL)").
--   3) RLS: yalnız ORG_ADMIN okur. INSERT/UPDATE/DELETE politikası YOK →
--      istemciler logu yazamaz/değiştiremez; yalnız trigger (SECURITY DEFINER,
--      tablo sahibi) yazar.
--
-- Deploy sırası: serbest. Kod log tablosu yoksa geçmişi göstermeden çalışır;
-- yine de DEV → PROD bu SQL'i deploy'dan önce çalıştırmak önerilir (aradaki
-- panel değişiklikleri loglanmaz).
-- ============================================================================

BEGIN;

-- 1) Log tablosu
CREATE TABLE IF NOT EXISTS public.workflow_step_changes (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id        uuid        NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  changed_by_user_id      uuid,       -- auth.uid(); NULL = Table Editor / SQL
  changed_by_employee_id  uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  old_static_position_id  uuid        REFERENCES public.positions(id) ON DELETE SET NULL,
  new_static_position_id  uuid        REFERENCES public.positions(id) ON DELETE SET NULL,
  old_position_title      text,
  new_position_title      text,
  old_name                text,
  new_name                text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_step_changes_step_created_idx
  ON public.workflow_step_changes (workflow_step_id, created_at DESC);

COMMENT ON TABLE public.workflow_step_changes IS
  'Süreç adımı pozisyon/ad değişiklik logu. Yalnız trigger (log_workflow_step_change) yazar; ORG_ADMIN okur.';

-- 2) RLS — yalnız ORG_ADMIN okur; yazma politikası bilinçli olarak yok
ALTER TABLE public.workflow_step_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_step_changes_select_admin ON public.workflow_step_changes;
CREATE POLICY workflow_step_changes_select_admin ON public.workflow_step_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
    )
  );

REVOKE ALL ON public.workflow_step_changes FROM anon;

-- 3) Trigger fonksiyonu + trigger
CREATE OR REPLACE FUNCTION public.log_workflow_step_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.static_position_id IS DISTINCT FROM OLD.static_position_id
     OR NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.workflow_step_changes (
      workflow_step_id,
      changed_by_user_id,
      changed_by_employee_id,
      old_static_position_id,
      new_static_position_id,
      old_position_title,
      new_position_title,
      old_name,
      new_name
    ) VALUES (
      NEW.id,
      auth.uid(),
      (SELECT au.employee_id FROM public.app_users au WHERE au.id = auth.uid()),
      OLD.static_position_id,
      NEW.static_position_id,
      (SELECT p.title FROM public.positions p WHERE p.id = OLD.static_position_id),
      (SELECT p.title FROM public.positions p WHERE p.id = NEW.static_position_id),
      OLD.name,
      NEW.name
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_steps_change_log ON public.workflow_steps;
CREATE TRIGGER workflow_steps_change_log
  AFTER UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.log_workflow_step_change();

COMMIT;

-- ============================================================================
-- Doğrulama (salt okunur)
-- ============================================================================
-- Tablo + RLS:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'workflow_step_changes';
-- Politikalar (yalnız SELECT beklenir):
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'workflow_step_changes';
-- Trigger:
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.workflow_steps'::regclass AND NOT tgisinternal;
-- anon yetkisi (boş beklenir):
--   SELECT privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'workflow_step_changes' AND grantee = 'anon';
