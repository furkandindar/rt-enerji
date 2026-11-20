-- =====================================================================
-- Gizli Süper Admin + sistem hesabı (1/2): şema — 2026-11-20
-- =====================================================================
-- Geliştiricinin sistemi incelemek ve takılan durumlara müdahale etmek için
-- kullandığı hesap şirketin rol/organizasyon görünümünde yer almamalı.
--
--   app_roles.is_hidden   gizli rol: Kullanıcılar ve Roller'de (liste, sayılar,
--                         rol seçenekleri, rol geçmişi) görünmez; set_user_role ile
--                         atanamaz ve bu roldeki kullanıcının rolü değiştirilemez
--                         (yalnız SQL/migration).
--   SUPER_ADMIN           gizli rol, tüm izinler.
--   employees.is_system   sistem çalışan kaydı: kişi listelerinden/seçicilerden,
--                         organizasyon şemasından ve @bahsetme adaylarından süzülür
--                         (kod: .eq("is_system", false)); geçmiş kayıtlarda adı
--                         çözülmeye devam eder. Bayrağı yalnız migration değiştirir;
--                         kaydı yalnız kendisi düzenler; pozisyon atanamaz.
--
-- Hesabın kendisine uygulanması (prod): feature_super_admin_2_prod_account.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Gizli rol
-- ---------------------------------------------------------------------
ALTER TABLE public.app_roles ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.app_roles.is_hidden IS
  'Gizli rol (SUPER_ADMIN): arayüzde listelenmez, set_user_role ile atanamaz/değiştirilemez.';

INSERT INTO public.app_roles (code, label, description, is_member, is_hidden, sort_order) VALUES
  ('SUPER_ADMIN', 'Süper Admin',
   'Sistem sahibi (geliştirici) hesabı: tüm izinler; arayüzde görünmez, arayüzden atanamaz.',
   true, true, 0);

INSERT INTO public.role_permissions (role, permission)
SELECT 'SUPER_ADMIN', code FROM public.permissions;

-- Oturumdaki kullanıcı gizli bir rolde mi (sistem hesabı)
CREATE OR REPLACE FUNCTION private.rls_is_hidden_role_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users au
    JOIN public.app_roles r ON r.code = au.role
    WHERE au.id = (SELECT auth.uid()) AND r.is_hidden
  )
$$;
REVOKE ALL ON FUNCTION private.rls_is_hidden_role_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_is_hidden_role_user() TO authenticated, service_role;

-- Rol atama: gizli roller arayüzden atanamaz; gizli roldeki kullanıcı değiştirilemez.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT private.has_permission('users.manage_roles') THEN
    RAISE EXCEPTION 'Rol atama yetkiniz yok' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Kendi rolünüzü değiştiremezsiniz' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_roles WHERE code = p_role) THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_role USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_roles WHERE code = p_role AND is_hidden) THEN
    RAISE EXCEPTION 'Bu rol arayüzden atanamaz' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_old FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_roles WHERE code = v_old AND is_hidden) THEN
    RAISE EXCEPTION 'Sistem hesabının rolü değiştirilemez' USING ERRCODE = '42501';
  END IF;
  IF v_old = p_role THEN
    RETURN;
  END IF;

  PERFORM set_config('app.role_change_reason', COALESCE(left(p_reason, 500), ''), true);
  UPDATE public.app_users SET role = p_role WHERE id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------
-- B. Sistem çalışan kaydı
-- ---------------------------------------------------------------------
ALTER TABLE public.employees ADD COLUMN is_system boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.employees.is_system IS
  'Sistem hesabının çalışan kaydı: kişi listelerinden, seçicilerden, organizasyon şemasından ve @bahsetme adaylarından süzülür. Yalnız migration değiştirir.';

-- Bayrak yalnız migration'la değişir; sistem kaydını yalnız kendisi düzenler/silemez kimse.
CREATE OR REPLACE FUNCTION private.employees_guard_system()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND NEW.is_system THEN
      RAISE EXCEPTION 'Sistem kaydı oluşturulamaz' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_system IS DISTINCT FROM OLD.is_system THEN
      RAISE EXCEPTION 'Sistem kaydı bayrağı değiştirilemez' USING ERRCODE = '42501';
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.is_system AND NOT private.rls_is_hidden_role_user() THEN
      RAISE EXCEPTION 'Sistem kaydı değiştirilemez' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER employees_guard_system
  BEFORE INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.employees_guard_system();

-- Sistem kaydına pozisyon atanamaz (organizasyona geri girmesin).
CREATE OR REPLACE FUNCTION private.employee_positions_guard_system()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = NEW.employee_id AND e.is_system) THEN
    RAISE EXCEPTION 'Sistem hesabına pozisyon atanamaz' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER employee_positions_guard_system
  BEFORE INSERT OR UPDATE ON public.employee_positions
  FOR EACH ROW EXECUTE FUNCTION private.employee_positions_guard_system();

-- @bahsetme adayları: sistem kaydı aday değildir.
CREATE OR REPLACE FUNCTION public.employees_who_can_view_request(p_request_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE req AS (
    SELECT r.id, r.requester_employee_id, r.workflow_definition_id, r.status,
           wd.is_restricted, wd.unit_manager_visible, wd.content_restricted
    FROM public.requests r
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
    WHERE r.id = p_request_id
  ),
  anc AS (
    SELECT p.unit_id AS id
    FROM req
    JOIN public.employee_positions ep ON ep.employee_id = req.requester_employee_id AND ep.end_date IS NULL
    JOIN public.positions p ON p.id = ep.position_id
    WHERE p.unit_id IS NOT NULL
    UNION
    SELECT ou.parent_id
    FROM public.organizational_units ou
    JOIN anc ON ou.id = anc.id
    WHERE ou.parent_id IS NOT NULL
  ),
  unit_managers AS (
    SELECT DISTINCT hep.employee_id
    FROM req
    CROSS JOIN anc
    JOIN public.positions hp ON hp.unit_id = anc.id AND hp.is_unit_head AND hp.is_active
    JOIN public.employee_positions hep ON hep.position_id = hp.id AND hep.end_date IS NULL
    WHERE req.unit_manager_visible AND NOT req.content_restricted AND req.status <> 'DRAFT'
  )
  SELECT e.id AS employee_id
  FROM public.employees e
  CROSS JOIN req
  WHERE (p_employee_ids IS NULL OR e.id = ANY (p_employee_ids))
    AND NOT e.is_system
    AND (
      req.is_restricted = false
      OR e.id = req.requester_employee_id
      OR EXISTS (
        SELECT 1 FROM public.app_users au
        JOIN public.role_permissions rp ON rp.role = au.role
        WHERE au.employee_id = e.id AND rp.permission = 'requests.view_all'
      )
      OR e.id IN (SELECT um.employee_id FROM unit_managers um)
      OR EXISTS (
        SELECT 1 FROM public.request_approvals ra
        WHERE ra.request_id = req.id
          AND (
            ra.approver_employee_id = e.id
            OR ra.acted_by_employee_id = e.id
            OR EXISTS (
              SELECT 1 FROM public.approval_delegations d
              WHERE d.status = 'ACTIVE'
                AND d.delegator_employee_id  = ra.approver_employee_id
                AND d.delegate_employee_id   = e.id
                AND d.workflow_definition_id = req.workflow_definition_id
                AND now() >= d.starts_at
                AND now() <  d.ends_at
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.workflow_initiators wi
        JOIN public.employee_positions ep
          ON ep.employee_id = e.id
         AND ep.end_date IS NULL
        JOIN public.positions p ON p.id = ep.position_id
        WHERE wi.workflow_definition_id = req.workflow_definition_id
          AND (
            (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
            OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
          )
      )
    );
$function$;

-- ---------------------------------------------------------------------
-- C. Doğrulama
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.role_permissions WHERE role = 'SUPER_ADMIN')
     <> (SELECT count(*) FROM public.permissions) THEN
    RAISE EXCEPTION 'SUPER_ADMIN tüm izinlere sahip değil';
  END IF;
  IF (SELECT count(*) FROM public.app_roles WHERE is_hidden) <> 1 THEN
    RAISE EXCEPTION 'Beklenen tek gizli rol SUPER_ADMIN';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-20 uygulandı. e2e 18/18 (geçici test hesabıyla:
--   gizli liste/rol/geçmiş, rol atama korumaları, kişi listeleri/seçiciler/şema/@bahsetme
--   süzmesi, sistem kaydı korumaları); rol regresyonu 46/46. Test hesabı geri alındı.
-- PROD (iiagqsbiexyukupkffwb): 2026-11-20 uygulandı (yalnız ekleme). Hesap adımı: dosya 2/2.
-- =====================================================================
