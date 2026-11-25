-- =====================================================================
-- Rol matrisi v2 (Genel Müdür'ün rol tablosu) — 2026-11-25
-- =====================================================================
-- Önceki: feature_roles_1_permissions.sql, feature_roles_2_unit_manager_scope.sql,
--         feature_super_admin_1_schema.sql
--
--   Admin      tüm izinler (değişmez; yeni izin de eklenir)
--   Yönetici   + birim taleplerini görme (requests.view_unit), taleplere müdahale,
--              her süreci başlatma, süreç tanımlarını değiştirme, rol atama.
--              "Tüm talepleri görme" yine YOK → müdahale yalnız görebildiği taleplerde
--              (talep uçları talebi oturumun RLS'iyle okur; görmediği talep 404).
--   Bilgi İşlem Uzmanı (ORG_IT, yeni)  teknik araçlar + süreç tanımlarını görme.
--   Müdür / Kullanıcı  değişmez.
--
-- Kararlar (kullanıcı, 2026-11-25):
--   * requests.view_unit = yalnız KENDİ birimi (alt birimler hariç). Müdür'ün kapsamı
--     (birim amiri: birimi + alt birimleri) aynen kalır. İkisi aynı Müdür süreç
--     kümesini (unit_manager_visible) kullanır; taslak ve içerik kısıtlı hariç.
--   * Rol atama yükseltme koruması: kişi yalnız izinleri KENDİ izinlerinin alt kümesi
--     olan rolü atayabilir ve yalnız böyle bir roldeki kişinin rolünü değiştirebilir.
--     → Yönetici Admin atayamaz, Admin'in rolüne dokunamaz; Admin her şeyi atar.
--   * Kendi pozisyonunu değiştirme koruması (org_guard_self_assignment) artık rol atama
--     iznine değil "tüm izinlere sahip mi"ye bakar; aksi halde rol atama alan Yönetici
--     kendini birim amiri / GM pozisyonuna atayabilirdi.
--
-- Hesap ataması (yalnız prod): feature_roles_3b_prod_role_assignment.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Katalog
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, label, description, category, sort_order) VALUES
  ('requests.view_unit', 'Birim taleplerini görme',
   'Kendi biriminin (alt birimler hariç) çalışanlarının taleplerini görme: Müdür kapsamındaki süreçler; taslak ve içerik kısıtlı süreçler hariç.',
   'Talepler', 75);

UPDATE public.app_roles SET sort_order = 4 WHERE code = 'ORG_VIEWER';
INSERT INTO public.app_roles (code, label, description, is_member, is_hidden, sort_order) VALUES
  ('ORG_IT', 'Bilgi İşlem Uzmanı',
   'Teknik araçlar (SharePoint) ve süreç tanımlarını görme; organizasyon yönetimi yok, talep içeriklerini görmez.',
   true, false, 3);

UPDATE public.app_roles
   SET description = 'Sistem yönetimi, süreç tanımları, rol atama (Admin hariç), her süreci başlatma; kendi biriminin taleplerini görür, görebildiği taleplere müdahale eder. Tüm talepleri görmez.'
 WHERE code = 'ORG_MANAGER';

INSERT INTO public.role_permissions (role, permission) VALUES
  ('ORG_ADMIN',   'requests.view_unit'),
  ('SUPER_ADMIN', 'requests.view_unit'),
  ('ORG_MANAGER', 'requests.view_unit'),
  ('ORG_MANAGER', 'requests.manage_all'),
  ('ORG_MANAGER', 'workflows.start_any'),
  ('ORG_MANAGER', 'workflows.manage'),
  ('ORG_MANAGER', 'users.manage_roles'),
  ('ORG_IT',      'integrations.manage'),
  ('ORG_IT',      'workflows.view');

-- ---------------------------------------------------------------------
-- B. Yardımcılar
-- ---------------------------------------------------------------------
-- Oturumdaki kullanıcı kataloğdaki TÜM izinlere sahip mi (Admin / Süper Admin).
CREATE OR REPLACE FUNCTION private.has_all_permissions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.permissions p
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.app_users au
      JOIN public.role_permissions rp ON rp.role = au.role
      WHERE au.id = (SELECT auth.uid())
        AND rp.permission = p.code
    )
  )
$$;
REVOKE ALL ON FUNCTION private.has_all_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_all_permissions() TO authenticated, service_role;

-- Rolün tüm izinleri oturumdaki kullanıcıda da var mı (yükseltme koruması).
CREATE OR REPLACE FUNCTION private.role_within_my_permissions(p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role = p_role
      AND NOT private.has_permission(rp.permission)
  )
$$;
REVOKE ALL ON FUNCTION private.role_within_my_permissions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.role_within_my_permissions(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- C. Rol atama: yükseltme koruması
-- ---------------------------------------------------------------------
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
  IF NOT private.role_within_my_permissions(p_role) THEN
    RAISE EXCEPTION 'Bu rolü atama yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_old FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_roles WHERE code = v_old AND is_hidden) THEN
    RAISE EXCEPTION 'Sistem hesabının rolü değiştirilemez' USING ERRCODE = '42501';
  END IF;
  IF NOT private.role_within_my_permissions(v_old) THEN
    RAISE EXCEPTION 'Bu kullanıcının rolünü değiştirme yetkiniz yok' USING ERRCODE = '42501';
  END IF;
  IF v_old = p_role THEN
    RETURN;
  END IF;

  PERFORM set_config('app.role_change_reason', COALESCE(left(p_reason, 500), ''), true);
  UPDATE public.app_users SET role = p_role WHERE id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------
-- D. Kendi pozisyonunu değiştirme koruması: muafiyet yalnız tüm izinlere sahip olana
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.org_guard_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_me uuid;
BEGIN
  IF current_user <> 'authenticated' OR private.has_all_permissions() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_me := private.get_current_employee_id();
  IF v_me IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'employee_positions' THEN
    IF (TG_OP IN ('INSERT', 'UPDATE') AND NEW.employee_id = v_me)
       OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.employee_id = v_me) THEN
      RAISE EXCEPTION 'Kendi pozisyon atamanızı değiştiremezsiniz; bir Admin''e başvurun'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'positions' THEN
    IF EXISTS (
      SELECT 1 FROM public.employee_positions ep
      WHERE ep.employee_id = v_me
        AND ep.end_date IS NULL
        AND ep.position_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Bulunduğunuz pozisyonu değiştiremezsiniz; bir Admin''e başvurun'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------
-- E. Birim kapsamı: Müdür (birimi + alt birimleri) ∪ requests.view_unit (yalnız kendi birimi)
-- ---------------------------------------------------------------------
-- rls_unit_manager_request_ids / rls_is_unit_manager / unit_manager_requests /
-- my_access.is_unit_manager bu kümeden beslenir; tümü kendiliğinden genişler.
CREATE OR REPLACE FUNCTION private.rls_managed_unit_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE tree AS (
    SELECT p.unit_id AS id
    FROM public.employee_positions ep
    JOIN public.positions p ON p.id = ep.position_id
    WHERE ep.employee_id = private.get_current_employee_id()
      AND ep.end_date IS NULL
      AND p.is_unit_head
      AND p.is_active
      AND p.unit_id IS NOT NULL
    UNION
    SELECT ou.id
    FROM public.organizational_units ou
    JOIN tree t ON ou.parent_id = t.id
  )
  SELECT id FROM tree
  UNION
  SELECT p.unit_id
  FROM public.employee_positions ep
  JOIN public.positions p ON p.id = ep.position_id
  WHERE ep.employee_id = private.get_current_employee_id()
    AND ep.end_date IS NULL
    AND p.is_active
    AND p.unit_id IS NOT NULL
    AND private.has_permission('requests.view_unit')
$$;

-- @bahsetme adayları (requests_select'in çalışan-parametreli karşılığı): Yönetici dalı.
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
  req_units AS (
    SELECT p.unit_id AS id
    FROM req
    JOIN public.employee_positions ep ON ep.employee_id = req.requester_employee_id AND ep.end_date IS NULL
    JOIN public.positions p ON p.id = ep.position_id
    WHERE p.unit_id IS NOT NULL
  ),
  anc AS (
    SELECT id FROM req_units
    UNION
    SELECT ou.parent_id
    FROM public.organizational_units ou
    JOIN anc ON ou.id = anc.id
    WHERE ou.parent_id IS NOT NULL
  ),
  unit_managers AS (
    -- Müdür: talep edenin birimi veya bir üst biriminin aktif birim amiri
    SELECT DISTINCT hep.employee_id
    FROM req
    CROSS JOIN anc
    JOIN public.positions hp ON hp.unit_id = anc.id AND hp.is_unit_head AND hp.is_active
    JOIN public.employee_positions hep ON hep.position_id = hp.id AND hep.end_date IS NULL
    WHERE req.unit_manager_visible AND NOT req.content_restricted AND req.status <> 'DRAFT'
    UNION
    -- requests.view_unit: talep edenle aynı birimde aktif pozisyonu olan
    SELECT vep.employee_id
    FROM req
    CROSS JOIN req_units
    JOIN public.positions vp ON vp.unit_id = req_units.id AND vp.is_active
    JOIN public.employee_positions vep ON vep.position_id = vp.id AND vep.end_date IS NULL
    JOIN public.app_users au ON au.employee_id = vep.employee_id
    JOIN public.role_permissions rpv ON rpv.role = au.role AND rpv.permission = 'requests.view_unit'
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
-- F. Doğrulama
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_perm int := (SELECT count(*) FROM public.permissions);
BEGIN
  IF (SELECT count(*) FROM public.role_permissions WHERE role = 'ORG_ADMIN') <> n_perm
     OR (SELECT count(*) FROM public.role_permissions WHERE role = 'SUPER_ADMIN') <> n_perm THEN
    RAISE EXCEPTION 'Admin / Süper Admin tüm izinlere sahip değil';
  END IF;
  IF EXISTS (
    SELECT code FROM public.permissions WHERE code <> 'requests.view_all'
    EXCEPT SELECT permission FROM public.role_permissions WHERE role = 'ORG_MANAGER'
  ) OR EXISTS (SELECT 1 FROM public.role_permissions WHERE role = 'ORG_MANAGER' AND permission = 'requests.view_all') THEN
    RAISE EXCEPTION 'Yönetici = tüm izinler eksi requests.view_all olmalı';
  END IF;
  IF (SELECT array_agg(permission ORDER BY permission) FROM public.role_permissions WHERE role = 'ORG_IT')
     <> ARRAY['integrations.manage', 'workflows.view'] THEN
    RAISE EXCEPTION 'Bilgi İşlem Uzmanı izinleri beklenenden farklı';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-25 uygulandı. Görünürlük 9 kullanıcı × tüm tablolar
--   birebir (dev'de Yönetici yoktu). Geçici rol atamalı SQL testleri: Yönetici 10 izin,
--   birim kapsamı yalnız kendi birimi (beklenmeyen 0, eksik 0), @bahsetme tutarlılığı 0/0,
--   set_user_role 7/7 (Admin atayamaz / Admin'i değiştiremez / kendini değiştiremez / gizli
--   rol yok), kendi pozisyon ataması engellendi, görünmeyen talebe UPDATE 0 satır.
--   Uç e2e 22/22 (Yönetici + Bilgi İşlem Uzmanı oturumlarıyla); geçici roller geri alındı.
-- PROD (iiagqsbiexyukupkffwb): 2026-11-25 uygulandı (ardından 3b). Görünürlük 79 kullanıcı:
--   75'i birebir (tek fark herkese açık app_users'taki rol satırı); Admin + Süper Admin +1
--   (rol geçmişi satırı); Yönetici (Genel Müdürlük birimi, 3 kişi) +14 = rol geçmişi 5 +
--   birim talep içerikleri 9; Bilgi İşlem Uzmanı sayılar aynı. Advisor: yalnız bilinçli
--   set_user_role + can_act_on_approval.
-- =====================================================================
