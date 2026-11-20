-- =====================================================================
-- Rol + izin modeli (1/2): izin altyapısı, Yönetici rolü, rol yönetimi
-- 2026-11-20
-- =====================================================================
-- Şirket görevi: "Admin ile Kullanıcı arasına Yönetici rolü (Admin, Yönetici,
-- Müdür, Kullanıcı)". Bekir Bey: sistemi yöneten biri (ör. Bilgi İşlem) admin
-- olmadan yetkili olabilmeli ama talep içeriklerini görmemeli.
--
-- Sorun: ORG_ADMIN tek pakette üç şey veriyordu — sistem yönetimi, tüm talepleri
-- görme, her talebe müdahale. "Yönetsin ama görmesin" ayrımı yapılamıyordu.
--
-- Çözüm: yetki rol ADINA değil İZNE bağlanır. Politikalar ve fonksiyonlar
-- 'ORG_ADMIN' yerine private.has_permission('<izin>') sorar; rol = izin listesi
-- (public.role_permissions). Bir rolün kapsamı değişince kod değil veri değişir.
--
--   Rol          Ad          İzinler
--   ORG_ADMIN    Admin       hepsi
--   ORG_MANAGER  Yönetici    org.manage, stamps.manage, delegations.manage_all,
--                            integrations.manage, workflows.view
--   ORG_VIEWER   Kullanıcı   —  (kendi talepleri + sırası gelen onaylar)
--   NONE         Erişim yok  kurum dışı hesap; üye değil
--
--   Müdür elle atanan bir rol DEĞİLDİR: birim amiri pozisyonundan türetilir
--   (positions.is_unit_head) → dosya 2/2 (feature_roles_2_unit_manager_scope.sql).
--
-- Bu dosya MEVCUT DAVRANIŞI DEĞİŞTİRMEZ: ORG_ADMIN tüm izinlere, ORG_VIEWER
-- hiçbirine sahip; her politika aynı satırları döndürür. Doğrulama: kullanıcı ×
-- tablo görünürlük özeti uygulama öncesi/sonrası birebir aynı olmalı.
-- Yeni olanlar: ORG_MANAGER rolü, rol atama RPC'si (yalnız Admin) + denetim
-- kaydı, Yönetici'nin kendini yetkilendirmesini önleyen koruma.
--
-- Sıra: önce DEV, doğrula, sonra PROD. Sonra kod deploy (kod my_access()
-- RPC'sine dayanır; DB önce gelmeli). Eski kod yeni DB ile çalışmaya devam eder
-- (rol kodları değişmedi).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Katalog tabloları: roller, izinler, rol→izin
-- ---------------------------------------------------------------------
CREATE TABLE public.app_roles (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  description text NOT NULL,
  is_member   boolean NOT NULL DEFAULT true,  -- kurum üyesi mi (rls_is_member)
  sort_order  smallint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_roles IS
  'Sistem rolleri (app_users.role). Yetki rol adına değil role_permissions''a bağlıdır. Müdür burada yok: birim amiri pozisyonundan türetilir.';

CREATE TABLE public.permissions (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL,
  sort_order  smallint NOT NULL
);
COMMENT ON TABLE public.permissions IS
  'İzin kataloğu. Politikalar/kod private.has_permission(code) ile sorar.';

CREATE TABLE public.role_permissions (
  role       text NOT NULL REFERENCES public.app_roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
  permission text NOT NULL REFERENCES public.permissions(code) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);
CREATE INDEX role_permissions_permission_idx ON public.role_permissions(permission);

INSERT INTO public.app_roles (code, label, description, is_member, sort_order) VALUES
  ('ORG_ADMIN',   'Admin',      'Tam yetki: sistem yönetimi, tüm talepleri görme ve müdahale, rol atama.', true, 1),
  ('ORG_MANAGER', 'Yönetici',   'Sistem yönetimi (organizasyon, sözlükler, kaşeler, vekaletler, teknik araçlar); talep içeriklerini görmez, taleplere müdahale etmez.', true, 2),
  ('ORG_VIEWER',  'Kullanıcı',  'Kendi talepleri ve sırası gelen onaylar.', true, 3),
  ('NONE',        'Erişim yok', 'Kurum dışı hesap; hiçbir veriyi görmez.', false, 9);

INSERT INTO public.permissions (code, label, description, category, sort_order) VALUES
  ('org.manage',             'Organizasyonu yönetme',      'Birimler, pozisyonlar, çalışanlar, pozisyon atamaları ve sözlükler (şirket, kademe, pozisyon/birim tipleri).', 'Sistem yönetimi', 10),
  ('stamps.manage',          'Kaşeleri yönetme',           'Kaşe tanımlarını ekleme ve düzenleme.', 'Sistem yönetimi', 20),
  ('delegations.manage_all', 'Tüm vekaletleri yönetme',    'Herkes adına vekalet tanımlama, görme ve sonlandırma.', 'Sistem yönetimi', 30),
  ('integrations.manage',    'Teknik araçlar',             'SharePoint bağlantı testi, klasör hazırlama, taşıma ve senkron yeniden deneme.', 'Sistem yönetimi', 40),
  ('workflows.view',         'Süreç tanımlarını görme',    'Süreç adımları, onaycılar ve değişiklik geçmişini görüntüleme.', 'Süreç yönetimi', 50),
  ('workflows.manage',       'Süreç tanımlarını değiştirme','Süreç adımlarını ve onaycı pozisyonlarını değiştirme.', 'Süreç yönetimi', 60),
  ('workflows.start_any',    'Her süreci başlatma',        'Başlatıcı kısıtı olan süreçleri de başlatabilme.', 'Talepler', 70),
  ('requests.view_all',      'Tüm talepleri görme',        'Tüm süreçlerin talepleri, içerikleri, PDF ve ekleri (içerik kısıtlı süreçler hariç).', 'Talepler', 80),
  ('requests.manage_all',    'Taleplere müdahale',         'Her talebi her durumda düzenleme, geri çekme ve iptal etme.', 'Talepler', 90),
  ('users.manage_roles',     'Rol atama',                  'Kullanıcıların rolünü değiştirme ve rol değişiklik geçmişini görme.', 'Erişim yönetimi', 100);

INSERT INTO public.role_permissions (role, permission)
SELECT 'ORG_ADMIN', code FROM public.permissions;

INSERT INTO public.role_permissions (role, permission) VALUES
  ('ORG_MANAGER', 'org.manage'),
  ('ORG_MANAGER', 'stamps.manage'),
  ('ORG_MANAGER', 'delegations.manage_all'),
  ('ORG_MANAGER', 'integrations.manage'),
  ('ORG_MANAGER', 'workflows.view');

-- Katalog sır değil: oturum açmış herkes okur (my_access() INVOKER okur).
-- Yazma yalnız migration / service role.
ALTER TABLE public.app_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_roles_select        ON public.app_roles        FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_select      ON public.permissions      FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.app_roles, public.permissions, public.role_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.app_roles, public.permissions, public.role_permissions FROM authenticated;

-- app_users.role artık katalogdaki bir rol olmak zorunda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_users au
             WHERE NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.code = au.role)) THEN
    RAISE EXCEPTION 'app_users.role içinde katalogda olmayan değer var';
  END IF;
END $$;
ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_fkey FOREIGN KEY (role) REFERENCES public.app_roles(code) ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS app_users_role_idx ON public.app_users(role);

-- ---------------------------------------------------------------------
-- B. Yardımcılar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users au
    JOIN public.role_permissions rp ON rp.role = au.role
    WHERE au.id = (SELECT auth.uid())
      AND rp.permission = p_permission
  )
$$;
COMMENT ON FUNCTION private.has_permission(text) IS
  'Oturumdaki kullanıcının rolü bu izni veriyor mu. Politikalarda ( SELECT private.has_permission(''x'') ) — sorgu başına bir kez.';
REVOKE ALL ON FUNCTION private.has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_permission(text) TO authenticated, service_role;

-- Üyelik artık rol listesi değil app_roles.is_member (ORG_MANAGER da üye).
CREATE OR REPLACE FUNCTION private.rls_is_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users au
    JOIN public.app_roles r ON r.code = au.role
    WHERE au.id = (SELECT auth.uid())
      AND r.is_member
  )
$$;

-- Oturumdaki kullanıcının erişim özeti (kod: lib/auth/access.ts, user-context).
-- Dosya 2/2 'is_unit_manager' alanını gerçek değerle yeniden tanımlar.
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'user_id',     au.id,
    'employee_id', au.employee_id,
    'role',        au.role,
    'role_label',  r.label,
    'permissions', COALESCE(
      (SELECT jsonb_agg(rp.permission ORDER BY rp.permission)
         FROM public.role_permissions rp WHERE rp.role = au.role),
      '[]'::jsonb),
    'is_unit_manager', false
  )
  FROM public.app_users au
  JOIN public.app_roles r ON r.code = au.role
  WHERE au.id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- C. Görünürlük fonksiyonları: 'ORG_ADMIN' → requests.view_all
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_view_workflow_requests(p_workflow_definition_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.has_permission('requests.view_all')
  OR EXISTS (
    SELECT 1 FROM workflow_definitions
    WHERE id = p_workflow_definition_id
      AND is_restricted = false
      AND private.rls_is_member()
  )
  OR EXISTS (
    SELECT 1
    FROM workflow_initiators wi
    JOIN employee_positions ep
      ON ep.employee_id = private.get_current_employee_id()
     AND ep.end_date IS NULL
    JOIN positions p ON p.id = ep.position_id
    WHERE wi.workflow_definition_id = p_workflow_definition_id
      AND (
        (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
        OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.rls_viewable_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT wd.id
  FROM public.workflow_definitions wd
  WHERE private.has_permission('requests.view_all')
     OR (wd.is_restricted = false AND private.rls_is_member())
     OR EXISTS (
          SELECT 1
          FROM public.workflow_initiators wi
          JOIN public.employee_positions ep
            ON ep.employee_id = private.get_current_employee_id()
           AND ep.end_date IS NULL
          JOIN public.positions p ON p.id = ep.position_id
          WHERE wi.workflow_definition_id = wd.id
            AND (
              (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
              OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
            )
        )
$function$;

-- Kendi çalışan kaydında yalnız imza alanları — org.manage sahibi hariç.
CREATE OR REPLACE FUNCTION private.employees_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT private.has_permission('org.manage') THEN
    IF (to_jsonb(NEW) - ARRAY['signature_path', 'signature_text', 'signature_font', 'updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['signature_path', 'signature_text', 'signature_font', 'updated_at']) THEN
      RAISE EXCEPTION 'Kendi çalışan kaydınızda yalnız imza alanları değiştirilebilir'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- @bahsetme adayları: talebi görebilecek çalışanlar. Admin dalı → requests.view_all.
CREATE OR REPLACE FUNCTION public.employees_who_can_view_request(p_request_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH req AS (
    SELECT r.id, r.requester_employee_id, r.workflow_definition_id, wd.is_restricted
    FROM public.requests r
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
    WHERE r.id = p_request_id
  )
  SELECT e.id AS employee_id
  FROM public.employees e
  CROSS JOIN req
  WHERE (p_employee_ids IS NULL OR e.id = ANY (p_employee_ids))
    AND (
      -- can_view_workflow_requests: kısıtsız süreç
      req.is_restricted = false
      -- talep sahibi
      OR e.id = req.requester_employee_id
      -- requests.view_all (Admin)
      OR EXISTS (
        SELECT 1 FROM public.app_users au
        JOIN public.role_permissions rp ON rp.role = au.role
        WHERE au.employee_id = e.id AND rp.permission = 'requests.view_all'
      )
      -- is_approver_for_request: onaycı / fiilen işlem yapan / aktif vekil
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
      -- can_view_workflow_requests: süreci başlatabilen pozisyon / birim
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
-- D. Politikalar: admin yüklemi → izin; üye listesi → rls_is_member()
-- ---------------------------------------------------------------------
-- Politikalar ALTER POLICY ile yerinde değişir (ad, komut, rol aynı kalır).
-- Yalnız admin/üye yüklemi değiştirilir; geri kalan ifade dokunulmadan kalır.
-- Her eşleme bir değişiklik üretmek zorunda; sonda hiçbir politikada
-- ORG_ADMIN / ORG_VIEWER / rls_is_org_admin kalmadığı doğrulanır.
DO $$
DECLARE
  m          record;
  pol        record;
  v_qual     text;
  v_check    text;
  v_repl     text;
  v_stmt     text;
  v_count    int := 0;
  admin_re   constant text := '\(EXISTS \( SELECT 1\s+FROM app_users au\s+WHERE \(\(au\.id = \( SELECT auth\.uid\(\) AS uid\)\) AND \(au\.role = ''ORG_ADMIN''::text\)\)\)\)';
  adminfn_re constant text := '\( SELECT private\.rls_is_org_admin\(\) AS rls_is_org_admin\)';
  member_re  constant text := '\(EXISTS \( SELECT 1\s+FROM app_users au\s+WHERE \(\(au\.id = \( SELECT auth\.uid\(\) AS uid\)\) AND \(au\.role = ANY \(ARRAY\[''ORG_ADMIN''::text, ''ORG_VIEWER''::text\]\)\)\)\)\)';
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      -- Organizasyon + sözlükler (yazma)
      ('companies',              'companies_insert_admin',              'org.manage'),
      ('companies',              'companies_update_admin',              'org.manage'),
      ('employee_positions',     'employee_positions_insert_admin',     'org.manage'),
      ('employee_positions',     'employee_positions_update_admin',     'org.manage'),
      ('employee_positions',     'employee_positions_delete_admin',     'org.manage'),
      ('employees',              'employees_insert_admin',              'org.manage'),
      ('employees',              'employees_update_admin',              'org.manage'),
      ('employees',              'employees_delete_admin',              'org.manage'),
      ('grade_levels',           'grade_levels_insert_admin',           'org.manage'),
      ('grade_levels',           'grade_levels_update_admin',           'org.manage'),
      ('grade_levels',           'grade_levels_delete_admin',           'org.manage'),
      ('organizational_units',   'organizational_units_insert_admin',   'org.manage'),
      ('organizational_units',   'organizational_units_update_admin',   'org.manage'),
      ('organizational_units',   'organizational_units_delete_admin',   'org.manage'),
      ('position_types',         'position_types_insert_admin',         'org.manage'),
      ('position_types',         'position_types_update_admin',         'org.manage'),
      ('position_types',         'position_types_delete_admin',         'org.manage'),
      ('positions',              'positions_insert_admin',              'org.manage'),
      ('positions',              'positions_update_admin',              'org.manage'),
      ('positions',              'positions_delete_admin',              'org.manage'),
      ('unit_types',             'unit_types_insert_admin',             'org.manage'),
      ('unit_types',             'unit_types_update_admin',             'org.manage'),
      ('unit_types',             'unit_types_delete_admin',             'org.manage'),
      -- Organizasyon + sözlükler (okuma: kurum üyeleri)
      ('companies',              'companies_select_auth',               '@member'),
      ('employee_positions',     'employee_positions_select_auth',      '@member'),
      ('employees',              'employees_select_auth',               '@member'),
      ('grade_levels',           'grade_levels_select_auth',            '@member'),
      ('organizational_units',   'organizational_units_select_auth',    '@member'),
      ('position_types',         'position_types_select_auth',          '@member'),
      ('positions',              'positions_select_auth',               '@member'),
      ('unit_types',             'unit_types_select_auth',              '@member'),
      -- Kaşeler
      ('stamps',                 'stamps_insert_admin',                 'stamps.manage'),
      ('stamps',                 'stamps_update_admin',                 'stamps.manage'),
      -- Vekaletler
      ('approval_delegations',   'approval_delegations_insert',         'delegations.manage_all'),
      ('approval_delegations',   'approval_delegations_select',         'delegations.manage_all'),
      ('approval_delegations',   'approval_delegations_update',         'delegations.manage_all'),
      -- Süreç tanımları
      ('workflow_definitions',   'workflow_definitions_insert_admin',   'workflows.manage'),
      ('workflow_definitions',   'workflow_definitions_update_admin',   'workflows.manage'),
      ('workflow_steps',         'workflow_steps_insert_admin',         'workflows.manage'),
      ('workflow_steps',         'workflow_steps_update_admin',         'workflows.manage'),
      ('workflow_step_changes',  'workflow_step_changes_select_admin',  'workflows.view'),
      ('workflow_content_viewers','workflow_content_viewers_select',    'workflows.view'),
      -- Talepler: görme
      ('requests',               'requests_select',                     'requests.view_all'),
      ('request_approvals',      'request_approvals_select',            'requests.view_all'),
      ('request_attachments',    'ra_select',                           'requests.view_all'),
      ('leave_requests',         'leave_requests_select',               'requests.view_all'),
      ('expense_requests',       'expense_requests_select',             'requests.view_all'),
      ('expense_items',          'expense_items_select',                'requests.view_all'),
      ('mukayese_requests',      'mukayese_requests_select',            'requests.view_all'),
      ('mukayese_items',         'mukayese_items_select',               'requests.view_all'),
      ('mukayese_prices',        'mukayese_prices_select',              'requests.view_all'),
      ('mukayese_suppliers',     'mukayese_suppliers_select',           'requests.view_all'),
      -- Talepler: müdahale (her durumda düzenleme)
      ('accounting_approval_cover_requests','accounting_approval_cover_requests_update','requests.manage_all'),
      ('accounting_approval_cover_items',   'accounting_approval_cover_items_update',   'requests.manage_all'),
      ('accounting_approval_cover_items',   'accounting_approval_cover_items_delete',   'requests.manage_all'),
      ('approval_letter_requests',          'approval_letter_requests_update',          'requests.manage_all'),
      ('expense_requests',                  'expense_requests_update',                  'requests.manage_all'),
      ('expense_items',                     'expense_items_update',                     'requests.manage_all'),
      ('expense_items',                     'expense_items_delete',                     'requests.manage_all'),
      ('finance_approval_cover_requests',   'finance_approval_cover_requests_update',   'requests.manage_all'),
      ('finance_approval_cover_items',      'finance_approval_cover_items_update',      'requests.manage_all'),
      ('finance_approval_cover_items',      'finance_approval_cover_items_delete',      'requests.manage_all'),
      ('leave_requests',                    'leave_requests_update',                    'requests.manage_all'),
      ('mukayese_requests',                 'mukayese_requests_update',                 'requests.manage_all'),
      ('mukayese_items',                    'mukayese_items_update',                    'requests.manage_all'),
      ('mukayese_items',                    'mukayese_items_delete',                    'requests.manage_all'),
      ('mukayese_prices',                   'mukayese_prices_update',                   'requests.manage_all'),
      ('mukayese_prices',                   'mukayese_prices_delete',                   'requests.manage_all'),
      ('mukayese_suppliers',                'mukayese_suppliers_update',                'requests.manage_all'),
      ('mukayese_suppliers',                'mukayese_suppliers_delete',                'requests.manage_all'),
      ('onboarding_requests',               'onboarding_requests_update',               'requests.manage_all'),
      ('overtime_requests',                 'overtime_requests_update',                 'requests.manage_all'),
      ('overtime_entries',                  'overtime_entries_update',                  'requests.manage_all'),
      ('overtime_entries',                  'overtime_entries_delete',                  'requests.manage_all'),
      ('request_form_requests',             'request_form_requests_update',             'requests.manage_all'),
      ('salary_advance_requests',           'salary_advance_requests_update',           'requests.manage_all'),
      ('separation_requests',               'separation_requests_update',               'requests.manage_all'),
      ('stamp_requests',                    'stamp_requests_update',                    'requests.manage_all'),
      ('travel_assignment_requests',        'travel_assignment_requests_update',        'requests.manage_all')
    ) AS v(tbl, pol_name, perm)
  LOOP
    SELECT p.qual, p.with_check INTO pol
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = m.tbl AND p.policyname = m.pol_name;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Politika bulunamadı: %.%', m.tbl, m.pol_name;
    END IF;

    IF m.perm = '@member' THEN
      v_qual  := regexp_replace(pol.qual,       member_re, '( SELECT private.rls_is_member() AS rls_is_member)', 'g');
      v_check := regexp_replace(pol.with_check, member_re, '( SELECT private.rls_is_member() AS rls_is_member)', 'g');
    ELSE
      v_repl  := format('( SELECT private.has_permission(%L::text) AS has_permission)', m.perm);
      v_qual  := regexp_replace(regexp_replace(pol.qual,       admin_re, v_repl, 'g'), adminfn_re, v_repl, 'g');
      v_check := regexp_replace(regexp_replace(pol.with_check, admin_re, v_repl, 'g'), adminfn_re, v_repl, 'g');
    END IF;

    IF v_qual IS NOT DISTINCT FROM pol.qual AND v_check IS NOT DISTINCT FROM pol.with_check THEN
      RAISE EXCEPTION 'Politikada değiştirilecek yüklem bulunamadı: %.%', m.tbl, m.pol_name;
    END IF;

    v_stmt := format('ALTER POLICY %I ON public.%I', m.pol_name, m.tbl);
    IF v_qual  IS NOT NULL THEN v_stmt := v_stmt || format(' USING (%s)', v_qual); END IF;
    IF v_check IS NOT NULL THEN v_stmt := v_stmt || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_stmt;
    v_count := v_count + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'ORG_ADMIN|ORG_VIEWER|rls_is_org_admin'
  ) THEN
    RAISE EXCEPTION 'Hâlâ rol adına bakan politika var';
  END IF;
  RAISE NOTICE 'Güncellenen politika: %', v_count;
END $$;

-- Artık hiçbir politika/fonksiyon kullanmıyor. CASCADE yok: bağımlı politika
-- kalmışsa DROP hata verir (ek güvence).
DROP FUNCTION private.rls_is_org_admin();

-- ---------------------------------------------------------------------
-- E. Rol atama: yalnız users.manage_roles (Admin), denetim kaydıyla
-- ---------------------------------------------------------------------
-- Denetim kaydı FK'siz (kullanıcı silinse/yeniden bağlansa da geçmiş kalır).
CREATE TABLE public.app_user_role_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  user_email        text,
  old_role          text,
  new_role          text NOT NULL,
  changed_by_user_id uuid,
  changed_by_email  text,
  reason            text,
  changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_user_role_changes_user_idx ON public.app_user_role_changes(user_id, changed_at DESC);
CREATE INDEX app_user_role_changes_changed_at_idx ON public.app_user_role_changes(changed_at DESC);
COMMENT ON TABLE public.app_user_role_changes IS
  'app_users.role değişiklik geçmişi (trigger yazar). changed_by NULL = SQL/migration ile değişti.';
ALTER TABLE public.app_user_role_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_user_role_changes_select ON public.app_user_role_changes
  FOR SELECT TO authenticated USING ((SELECT private.has_permission('users.manage_roles')));
REVOKE ALL ON public.app_user_role_changes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_user_role_changes FROM authenticated;

CREATE OR REPLACE FUNCTION private.app_users_audit_role_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  INSERT INTO public.app_user_role_changes
    (user_id, user_email, old_role, new_role, changed_by_user_id, changed_by_email, reason)
  VALUES (
    NEW.id, NEW.email, OLD.role, NEW.role, v_actor,
    (SELECT au.email FROM public.app_users au WHERE au.id = v_actor),
    NULLIF(current_setting('app.role_change_reason', true), '')
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.app_users_audit_role_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER app_users_audit_role_change
  AFTER UPDATE OF role ON public.app_users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION private.app_users_audit_role_change();

-- Rol değiştirme tek kapıdan: yetki kontrolü fonksiyonun içinde. app_users.role
-- kolonu authenticated'a kapalı (self-escalation kilidi); bu fonksiyon definer.
-- Kendi rolünü değiştirmek yasak → en az bir Admin (çağıran) her zaman kalır.
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

  SELECT role INTO v_old FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı' USING ERRCODE = 'P0002';
  END IF;
  IF v_old = p_role THEN
    RETURN;
  END IF;

  PERFORM set_config('app.role_change_reason', COALESCE(left(p_reason, 500), ''), true);
  UPDATE public.app_users SET role = p_role WHERE id = p_user_id;
END;
$$;
COMMENT ON FUNCTION public.set_user_role(uuid, text, text) IS
  'Rol atama (yalnız users.manage_roles). SECURITY DEFINER kasıtlı: yetki içeride kontrol edilir; denetim trigger''ı çağıranı auth.uid() ile yazar.';
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- F. Kendini yetkilendirme koruması (org.manage sahibi ama Admin değil)
-- ---------------------------------------------------------------------
-- org.manage, pozisyon atamalarını değiştirebilir; bu da dolaylı yetki demek
-- (İK birimine/GM pozisyonuna geçen kişi o kapsamı görür). Yönetici başkaları
-- için bunu yapabilir ama KENDİ atamasına ve bulunduğu pozisyona dokunamaz.
-- Admin (users.manage_roles) muaf; service role muaf.
CREATE OR REPLACE FUNCTION private.org_guard_self_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_me uuid;
BEGIN
  IF current_user <> 'authenticated' OR private.has_permission('users.manage_roles') THEN
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
$$;

CREATE TRIGGER employee_positions_guard_self_assignment
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_positions
  FOR EACH ROW EXECUTE FUNCTION private.org_guard_self_assignment();
CREATE TRIGGER positions_guard_self_assignment
  BEFORE UPDATE OR DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION private.org_guard_self_assignment();

-- ---------------------------------------------------------------------
-- G. Doğrulama
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.role_permissions WHERE role = 'ORG_ADMIN')
     <> (SELECT count(*) FROM public.permissions) THEN
    RAISE EXCEPTION 'ORG_ADMIN tüm izinlere sahip değil';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_permissions WHERE role IN ('ORG_VIEWER', 'NONE')) THEN
    RAISE EXCEPTION 'ORG_VIEWER/NONE izin almamalı';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_permissions
             WHERE role = 'ORG_MANAGER'
               AND permission IN ('requests.view_all', 'requests.manage_all', 'users.manage_roles',
                                  'workflows.manage', 'workflows.start_any')) THEN
    RAISE EXCEPTION 'Yönetici talep içeriği/müdahale/rol atama izni almamalı';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ 'ORG_ADMIN|rls_is_org_admin'
  ) THEN
    RAISE EXCEPTION 'Hâlâ ORG_ADMIN adına bakan fonksiyon var';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Uygulama notları
-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-20 uygulandı. 79 politika ALTER POLICY ile
--   dönüştü, rls_is_org_admin düştü. Görünürlük özeti (9 kullanıcı × 45 tablo,
--   24.228 satır) uygulama öncesi/sonrası birebir aynı. e2e (localhost → dev) 46/46:
--   rol atama + denetim, Yönetici (org yazar, içerik/müdahale/rol atama yok, kendine
--   pozisyon atayamaz), Admin, Kullanıcı regresyonu.
-- PROD (iiagqsbiexyukupkffwb): 2026-11-20 uygulandı. Görünürlük özeti (79 kullanıcı ×
--   45 tablo, 887.709 satır) öncesi/sonrası birebir aynı. Advisor: yalnız bilinçli
--   set_user_role + mevcut can_act_on_approval (SECURITY DEFINER, yetki içeride).
