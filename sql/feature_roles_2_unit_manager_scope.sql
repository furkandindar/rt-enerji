-- =====================================================================
-- Rol + izin modeli (2/2): Müdür kapsamı + Admin içerik tutarlılığı
-- 2026-11-20 — önce feature_roles_1_permissions.sql uygulanmış olmalı.
-- =====================================================================
-- Müdür elle atanan bir rol değildir: aktif birim amiri pozisyonu
-- (positions.is_unit_head) olan kişi kendiliğinden Müdür'dür. Kapsamı: amiri
-- olduğu birim + tüm alt birimleri. Görev değişince kapsam kendiliğinden taşınır.
--
-- Müdür ne görür (salt okunur): kapsamındaki birimlerde aktif pozisyonu olan
-- çalışanların, "Müdür görür" işaretli süreçlerdeki talepleri — başlık, içerik,
-- onay geçmişi, ekler, PDF. Taslaklar (DRAFT) ve içerik kısıtlı süreçler hariç.
-- Müdahale (düzenleme/iptal) yok; onay yetkisi her zamanki gibi zincirden gelir.
--
--   workflow_definitions.unit_manager_visible (süreç bazında açılır/kapanır)
--     açık : yıllık/kısa izin, uzaktan çalışma, görev formu, talep formu,
--            olur yazısı, kaşeli belge, mukayese, harcama, finans/muhasebe kapağı
--     kapalı: maaş avansı (kişisel/finansal), fazla mesai ve İK formları (İK
--            süreçleri), İşe Giriş/İşten Çıkış Onay (içerik kısıtlı)
--
-- Admin içerik tutarlılığı: requests.view_all "tüm talepler + içerik" demek;
-- 5 detay tablosunun (olur yazısı, talep formu, maaş avansı, kaşeli belge,
-- görev formu) SELECT politikasında admin dalı yoktu → admin zincirde değilse
-- detay boş geliyordu. Bu dosya dalı ekler (Admin görünürlüğü bilinçli genişler).
--
-- Doğrulama: Müdür olmayan ve Admin olmayan herkes için görünürlük birebir aynı
-- kalmalı; farklar yalnız (a) birim amirlerinde, (b) Admin'de bu 5 tabloda.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Süreç bazında Müdür görünürlüğü
-- ---------------------------------------------------------------------
ALTER TABLE public.workflow_definitions
  ADD COLUMN unit_manager_visible boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.workflow_definitions.unit_manager_visible IS
  'true: birim amiri (Müdür) kendi birimi ve alt birimlerindeki çalışanların bu süreçteki taleplerini salt okunur görür. İçerik kısıtlı süreçlerde etkisizdir.';

UPDATE public.workflow_definitions
SET unit_manager_visible = true
WHERE code IN (
  'ANNUAL_LEAVE', 'SHORT_LEAVE', 'REMOTE_WORK', 'TRAVEL_ASSIGNMENT', 'REQUEST_FORM',
  'APPROVAL_LETTER', 'STAMP_APPROVAL', 'COMPARISON_FORM', 'EXPENSE_FORM',
  'FINANCE_APPROVAL_COVER', 'ACCOUNTING_APPROVAL_COVER'
);

-- ---------------------------------------------------------------------
-- B. Yardımcılar
-- ---------------------------------------------------------------------
-- Oturumdaki kişinin amiri olduğu birimler + tüm alt birimler.
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
$$;

CREATE OR REPLACE FUNCTION private.rls_is_unit_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM private.rls_managed_unit_ids())
$$;

-- Müdürün kapsamındaki talepler (taslak ve içerik kısıtlı hariç).
-- Talep sahibinin birimi = bugünkü aktif pozisyonlarının birimleri.
CREATE OR REPLACE FUNCTION private.rls_unit_manager_request_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id
  FROM public.requests r
  JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
  WHERE wd.unit_manager_visible
    AND NOT wd.content_restricted
    AND r.status <> 'DRAFT'
    AND r.requester_employee_id IN (
      SELECT ep.employee_id
      FROM public.employee_positions ep
      JOIN public.positions p ON p.id = ep.position_id
      WHERE ep.end_date IS NULL
        AND p.unit_id IN (SELECT private.rls_managed_unit_ids())
    )
$$;

REVOKE ALL ON FUNCTION private.rls_managed_unit_ids()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.rls_is_unit_manager()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.rls_unit_manager_request_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_managed_unit_ids()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.rls_is_unit_manager()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.rls_unit_manager_request_ids() TO authenticated, service_role;

-- "Birimimin Talepleri" listesi (kendi talepleri hariç). INVOKER: requests RLS
-- üstüne uygulanır. PostgREST: rpc('unit_manager_requests').select(...).range(...)
CREATE OR REPLACE FUNCTION public.unit_manager_requests()
RETURNS SETOF public.requests
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT r.*
  FROM public.requests r
  WHERE r.id IN (SELECT private.rls_unit_manager_request_ids())
    AND r.requester_employee_id IS DISTINCT FROM (SELECT private.get_current_employee_id())
$$;
REVOKE ALL ON FUNCTION public.unit_manager_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_manager_requests() TO authenticated;

-- Erişim özeti: is_unit_manager artık gerçek.
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
    'is_unit_manager', private.rls_is_unit_manager()
  )
  FROM public.app_users au
  JOIN public.app_roles r ON r.code = au.role
  WHERE au.id = (SELECT auth.uid())
$$;

-- ---------------------------------------------------------------------
-- C. Politikalar
-- ---------------------------------------------------------------------
-- Başlık
ALTER POLICY requests_select ON public.requests USING (
  (requester_employee_id = (SELECT private.get_current_employee_id()))
  OR (SELECT private.has_permission('requests.view_all'))
  OR (workflow_definition_id IN (SELECT private.rls_viewable_workflow_ids()))
  OR (id IN (SELECT private.rls_approver_request_ids()))
  OR (id IN (SELECT private.rls_unit_manager_request_ids()))
);

-- Onay geçmişi
ALTER POLICY request_approvals_select ON public.request_approvals USING (
  (approver_employee_id = (SELECT private.get_current_employee_id()))
  OR (acted_by_employee_id = (SELECT private.get_current_employee_id()))
  OR (SELECT private.has_permission('requests.view_all'))
  OR (request_id IN (SELECT private.rls_own_or_workflow_viewable_request_ids()))
  OR (request_id IN (SELECT private.rls_unit_manager_request_ids()))
  OR (
    EXISTS (
      SELECT 1 FROM public.approval_delegations d
      WHERE d.delegate_employee_id = (SELECT private.get_current_employee_id())
        AND d.status = 'ACTIVE'
        AND now() >= d.starts_at
        AND now() < d.ends_at
    )
    AND public.can_act_on_approval(id)
  )
);

-- Ekler (içerik kısıtı ayrı AND koşulu olarak aynen korunur)
ALTER POLICY ra_select ON public.request_attachments USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_attachments.request_id
      AND (
        r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR (SELECT private.has_permission('requests.view_all'))
        OR r.workflow_definition_id IN (SELECT private.rls_viewable_workflow_ids())
        OR r.id IN (
          SELECT ra2.request_id FROM public.request_approvals ra2
          WHERE ra2.approver_employee_id = (SELECT private.get_current_employee_id())
        )
        OR r.id IN (SELECT private.rls_unit_manager_request_ids())
      )
      AND (
        NOT (r.workflow_definition_id IN (SELECT private.rls_content_restricted_workflow_ids()))
        OR r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
      )
  )
);

-- Detay tabloları: talep sahibi | onaycı | requests.view_all | Müdür kapsamı.
-- (Talep sahibi/onaycı yüklemleri önceki politikalarla eşdeğer; yazım tekleştirildi.)
DO $$
DECLARE
  m record;
  v_pred constant text :=
    '(r.requester_employee_id = (SELECT private.get_current_employee_id())'
    || ' OR EXISTS (SELECT 1 FROM public.request_approvals ra WHERE ra.request_id = r.id'
    || '            AND ra.approver_employee_id = (SELECT private.get_current_employee_id()))'
    || ' OR (SELECT private.has_permission(''requests.view_all''))'
    || ' OR r.id IN (SELECT private.rls_unit_manager_request_ids()))';
BEGIN
  -- Doğrudan request_id taşıyan detay tabloları
  FOR m IN SELECT * FROM (VALUES
      ('leave_requests',             'leave_requests_select'),
      ('expense_requests',           'expense_requests_select'),
      ('mukayese_requests',          'mukayese_requests_select'),
      ('approval_letter_requests',   'approval_letter_requests_select'),
      ('request_form_requests',      'request_form_requests_select'),
      ('salary_advance_requests',    'salary_advance_requests_select'),
      ('stamp_requests',             'stamp_requests_select'),
      ('travel_assignment_requests', 'travel_assignment_requests_select')
    ) AS v(tbl, pol)
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = %I.request_id AND %s))',
      m.pol, m.tbl, m.tbl, v_pred);
  END LOOP;

  -- Kalem tabloları (üst detay tablosu üzerinden)
  EXECUTE format(
    'ALTER POLICY expense_items_select ON public.expense_items USING (EXISTS (SELECT 1 FROM public.expense_requests er JOIN public.requests r ON r.id = er.request_id WHERE er.id = expense_items.expense_request_id AND %s))',
    v_pred);
  EXECUTE format(
    'ALTER POLICY mukayese_items_select ON public.mukayese_items USING (EXISTS (SELECT 1 FROM public.mukayese_requests mr JOIN public.requests r ON r.id = mr.request_id WHERE mr.id = mukayese_items.mukayese_request_id AND %s))',
    v_pred);
  EXECUTE format(
    'ALTER POLICY mukayese_suppliers_select ON public.mukayese_suppliers USING (EXISTS (SELECT 1 FROM public.mukayese_requests mr JOIN public.requests r ON r.id = mr.request_id WHERE mr.id = mukayese_suppliers.mukayese_request_id AND %s))',
    v_pred);
  EXECUTE format(
    'ALTER POLICY mukayese_prices_select ON public.mukayese_prices USING (EXISTS (SELECT 1 FROM public.mukayese_items mi JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id JOIN public.requests r ON r.id = mr.request_id WHERE mi.id = mukayese_prices.mukayese_item_id AND %s))',
    v_pred);
END $$;

-- ---------------------------------------------------------------------
-- D. @bahsetme adayları: Müdür kapsamı da talebi görebilir
-- ---------------------------------------------------------------------
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
  -- Talep sahibinin birimleri ve tüm üst birimleri
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
  -- Bu birimlerin amirleri (Müdür kapsamı), süreç Müdür'e açıksa
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
      -- Müdür kapsamı
      OR e.id IN (SELECT um.employee_id FROM unit_managers um)
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
-- E. Doğrulama
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workflow_definitions WHERE content_restricted AND unit_manager_visible) THEN
    RAISE EXCEPTION 'İçerik kısıtlı süreç Müdür''e açılmamalı';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_definitions WHERE code = 'SALARY_ADVANCE' AND unit_manager_visible) THEN
    RAISE EXCEPTION 'Maaş avansı Müdür''e açılmamalı';
  END IF;
  IF (SELECT count(*) FROM public.workflow_definitions WHERE unit_manager_visible) <> 11 THEN
    RAISE EXCEPTION 'Beklenen 11 süreç Müdür''e açık değil';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Uygulama notları
-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-20 uygulandı. Görünürlük farkı yalnız birim
--   amirinde (Finans Müdürü: ekibinin 22 kaşeli belge talebi; hepsi Müdür kapsamında);
--   Müdür olmayanlar birebir aynı (workflow_definitions farkı yalnız 11 satırın
--   updated_at'i). e2e: Birimimin Talepleri, içerik/PDF/ek erişimi, maaş avansı ve
--   İK formu kapalı, iptal edemez.
-- PROD (iiagqsbiexyukupkffwb): 2026-11-20 uygulandı. 79 kullanıcıdan görünürlüğü
--   değişen 11 kişinin tamamı izinli kümede: 5 Admin (5 detay tablosu açıldı) + 6 birim
--   amiri (Adil Aktaş, Av. Güliz Kaya, Durmuş Görkem Kurt, Gözde Özay, Hakan Çelik,
--   Tarık Uslu; ön ölçümde ~104 talep). Diğer 68 kişi birebir aynı.
