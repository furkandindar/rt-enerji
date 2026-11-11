-- ============================================================================
-- SERTLEŞTİRME 1/2: yetki fonksiyonları API dışına, politikalar yalnız
-- authenticated'a, eksik FK indeksleri, gereksiz tablo yetkileri
-- ============================================================================
--
-- Davranış (kim neyi görür / yazar) DEĞİŞMEZ. Kod değişikliği gerektirmez.
--
-- 1) `private` şeması: RLS ve view'ların kullandığı SECURITY DEFINER yardımcıları
--    public'ten private'a taşınır. PostgREST yalnız public'i API'ye açar; private'taki
--    fonksiyonlar /rest/v1/rpc ile çağrılamaz, ama politikalar/view'lar/trigger'lar
--    fonksiyonu OID ile tuttuğu için aynen çalışmaya devam eder (Supabase önerisi:
--    "security definer fonksiyonları açık şemada tutma").
--    Gövdesinde bu fonksiyonları ADIYLA çağıran fonksiyonlar (sql/plpgsql metni) bu
--    script içinde yeniden yazılır: yalnız `public.<ad>(` → `private.<ad>(`.
--    Public'te bilinçli olarak kalanlar (uygulama RPC ile çağırır):
--      - can_act_on_approval  → lib/workflow/delegation.ts (yalnız çağıranın kendi
--        yetkisini döner; tasarım gereği açık)
--      - create_notification  → sertleştirme 2'de yalnız service_role'e kapanır
--      - employees_who_can_view_request, insert_extra_approvers_before → zaten
--        yalnız service_role
--      - create_mukayese_request → SECURITY INVOKER (RLS uygulanır)
--    private'ta authenticated EXECUTE yalnız politika/view'ların gerçekten çağırdığı
--    fonksiyonlara verilir; diğerleri (next_request_no, is_active_delegate_for,
--    can_view_workflow_requests, is_approver_for_same_request) yalnız SECURITY
--    DEFINER fonksiyonların içinden (sahip yetkisiyle) çağrılır.
--    Böylece giriş yapmış biri de artık ör. next_request_no ile talep numarası
--    yakamaz / rastgele sequence oluşturamaz, approval_* ile RLS dışı onay
--    satırı bilgisi okuyamaz.
-- 2) public şemasındaki tüm `TO public` politikalar `TO authenticated` olur
--    (anon'un zaten tablo yetkisi yok; service_role/postgres RLS'i bypass eder).
--    Ölü `notifications_insert_anon` politikası kaldırılır.
-- 3) Aynı tablo+UPDATE için iki permissive politika (salary_advance_requests,
--    travel_assignment_requests) tek politikada birleştirilir: USING = A OR B,
--    WITH CHECK = coalesce(chkA, A) OR coalesce(chkB, B) — Postgres'in permissive
--    politikaları birleştirme kuralıyla birebir aynı. Metin pg_policies'ten okunur
--    (elle yeniden yazılmaz).
-- 4) Kapsayan indeksi olmayan 29 foreign key'e indeks (tablolar küçük; kilit ms).
-- 5) Tablo yetkisi hijyeni: authenticated'ın TRUNCATE/REFERENCES/TRIGGER yetkileri
--    (PostgREST'ten zaten erişilemez) ve yalnız sunucunun kullandığı
--    sharepoint_sync_queue / user_ms_tokens yetkileri kaldırılır (politika yok →
--    RLS zaten her şeyi reddediyordu; kod yalnız service_role ile erişir).
--    View'larda yalnız SELECT kalır.
--
-- Önce DEV, sonra PROD. Script sonunda doğrulama blokları vardır; beklenmeyen
-- durum varsa EXCEPTION → transaction geri alınır.
--
-- DEV: 2026-11-12 uygulandı. RLS altında 9 kullanıcı × 46 tablo görünen kayıtlar
--      önce/sonra birebir (23.051 satır); e2e 80/80; security advisor
--      "authenticated SECURITY DEFINER" 14 → 2 (can_act_on_approval + create_notification;
--      ikincisi hardening_2'de kapanır).
-- PROD: 2026-11-12 uygulandı (kullanıcı onayıyla). RLS altında 77 kullanıcı × 46 tablo
--       (817.815 satır) önce/sonra birebir aynı özet.
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1a) private şeması
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 1b) Taşı (OID korunur → politikalar, view'lar, trigger'lar otomatik izler)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.get_current_employee_id()                     SET SCHEMA private;
ALTER FUNCTION public.rls_is_org_admin()                            SET SCHEMA private;
ALTER FUNCTION public.rls_viewable_workflow_ids()                   SET SCHEMA private;
ALTER FUNCTION public.rls_approver_request_ids()                    SET SCHEMA private;
ALTER FUNCTION public.rls_own_or_workflow_viewable_request_ids()    SET SCHEMA private;
ALTER FUNCTION public.approval_stored_approver(uuid)                SET SCHEMA private;
ALTER FUNCTION public.approval_queued_at(uuid)                      SET SCHEMA private;
ALTER FUNCTION public.is_approver_for_request(uuid)                 SET SCHEMA private;
ALTER FUNCTION public.is_active_delegate_for(uuid, uuid)            SET SCHEMA private;
ALTER FUNCTION public.can_view_workflow_requests(uuid)              SET SCHEMA private;
ALTER FUNCTION public.is_approver_for_same_request(uuid)            SET SCHEMA private;
ALTER FUNCTION public.next_request_no(integer)                      SET SCHEMA private;

-- ----------------------------------------------------------------------------
-- 1c) Adıyla çağıran gövdeleri yeniden yaz: yalnız `public.<ad>(` → `private.<ad>(`
--     (CREATE OR REPLACE OID'i, sahibi ve yetkileri korur)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  c_moved constant text[] := ARRAY[
    'get_current_employee_id', 'rls_is_org_admin', 'rls_viewable_workflow_ids',
    'rls_approver_request_ids', 'rls_own_or_workflow_viewable_request_ids',
    'approval_stored_approver', 'approval_queued_at', 'is_approver_for_request',
    'is_active_delegate_for', 'can_view_workflow_requests',
    'is_approver_for_same_request', 'next_request_no'];
  f record;
  m text;
  v_old text;
  v_new text;
  v_changed int := 0;
  v_bad text;
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
      AND l.lanname IN ('sql', 'plpgsql')
  LOOP
    v_old := pg_get_functiondef(f.oid);
    v_new := v_old;
    FOREACH m IN ARRAY c_moved LOOP
      v_new := replace(v_new, 'public.' || m || '(', 'private.' || m || '(');
    END LOOP;
    IF v_new <> v_old THEN
      EXECUTE v_new;
      v_changed := v_changed + 1;
      RAISE NOTICE 'gövde güncellendi: %.%', f.nspname, f.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'yeniden yazılan fonksiyon: %', v_changed;

  -- Doğrulama: taşınan bir fonksiyonu `private.` önekisiz çağıran gövde kalmamalı
  SELECT string_agg(DISTINCT n.nspname || '.' || p.proname || ' → ' || mm, ', ')
    INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN unnest(c_moved) AS mm
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND (SELECT count(*) FROM regexp_matches(p.prosrc, '\m' || mm || '\s*\(', 'g'))
      <> (SELECT count(*) FROM regexp_matches(p.prosrc, 'private\.' || mm || '\s*\(', 'g'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Önek almamış çağrı kaldı: %', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1d) private yetkileri
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
-- Politika ve security_invoker view'ların authenticated olarak çağırdıkları:
GRANT EXECUTE ON FUNCTION
  private.get_current_employee_id(),
  private.rls_is_org_admin(),
  private.rls_viewable_workflow_ids(),
  private.rls_approver_request_ids(),
  private.rls_own_or_workflow_viewable_request_ids(),
  private.approval_stored_approver(uuid),   -- request_approvals_update WITH CHECK
  private.approval_queued_at(uuid),         -- v_user_pending_approvals
  private.is_approver_for_request(uuid)     -- requests_update
TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Politikalar: TO public → TO authenticated
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_anon ON public.notifications;

DO $$
DECLARE pol record; v_count int := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', pol.policyname, pol.tablename);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'TO authenticated: % politika', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Çift permissive UPDATE politikalarını birleştir (metin pg_policies'ten)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  m record;
  a record;
  b record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('salary_advance_requests', 'salary_advance_requests_update_requester',
       'salary_advance_requests_update_approver', 'salary_advance_requests_update'),
      ('travel_assignment_requests', 'travel_assignment_requests_update_requester',
       'travel_assignment_requests_update_approver', 'travel_assignment_requests_update')
    ) AS v(tbl, pol_a, pol_b, new_name)
  LOOP
    SELECT qual, with_check, roles, cmd, permissive INTO a FROM pg_policies
     WHERE schemaname = 'public' AND tablename = m.tbl AND policyname = m.pol_a;
    SELECT qual, with_check, roles, cmd, permissive INTO b FROM pg_policies
     WHERE schemaname = 'public' AND tablename = m.tbl AND policyname = m.pol_b;
    IF a.qual IS NULL OR b.qual IS NULL
       OR a.cmd <> 'UPDATE' OR b.cmd <> 'UPDATE'
       OR a.permissive <> 'PERMISSIVE' OR b.permissive <> 'PERMISSIVE'
       OR a.roles <> ARRAY['authenticated']::name[] OR b.roles <> ARRAY['authenticated']::name[] THEN
      RAISE EXCEPTION 'Beklenmeyen politika yapısı: %', m.tbl;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', m.pol_a, m.tbl);
    EXECUTE format('DROP POLICY %I ON public.%I', m.pol_b, m.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING ((%s) OR (%s)) WITH CHECK ((%s) OR (%s))',
      m.new_name, m.tbl,
      a.qual, b.qual,
      coalesce(a.with_check, a.qual), coalesce(b.with_check, b.qual));
    RAISE NOTICE 'birleştirildi: %', m.new_name;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Foreign key indeksleri
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_users_employee_id ON public.app_users (employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_cancelled_by_user_id ON public.approval_delegations (cancelled_by_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_created_by_user_id ON public.approval_delegations (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_leave_request_id ON public.approval_delegations (leave_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_workflow_definition_id ON public.approval_delegations (workflow_definition_id);
CREATE INDEX IF NOT EXISTS idx_organizational_units_parent_id ON public.organizational_units (parent_id);
CREATE INDEX IF NOT EXISTS idx_organizational_units_unit_type_id ON public.organizational_units (unit_type_id);
CREATE INDEX IF NOT EXISTS idx_positions_level_band ON public.positions (level_band);
CREATE INDEX IF NOT EXISTS idx_positions_position_type_id ON public.positions (position_type_id);
CREATE INDEX IF NOT EXISTS idx_positions_reports_to_position_id ON public.positions (reports_to_position_id);
CREATE INDEX IF NOT EXISTS idx_positions_unit_id ON public.positions (unit_id);
CREATE INDEX IF NOT EXISTS idx_request_approvals_carried_over_from_id ON public.request_approvals (carried_over_from_id);
CREATE INDEX IF NOT EXISTS idx_request_approvals_revision_target_approval_id ON public.request_approvals (revision_target_approval_id);
CREATE INDEX IF NOT EXISTS idx_request_approvals_workflow_step_id ON public.request_approvals (workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_request_attachments_uploaded_by ON public.request_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_request_extra_approvers_added_by_employee_id ON public.request_extra_approvers (added_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_request_extra_approvers_employee_id ON public.request_extra_approvers (employee_id);
CREATE INDEX IF NOT EXISTS idx_request_extra_approvers_workflow_step_id ON public.request_extra_approvers (workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_request_mentions_mentioned_by_employee_id ON public.request_mentions (mentioned_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_last_action_by ON public.requests (last_action_by);
CREATE INDEX IF NOT EXISTS idx_stamp_requests_stamp_id ON public.stamp_requests (stamp_id);
CREATE INDEX IF NOT EXISTS idx_travel_assignment_requests_company_id ON public.travel_assignment_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_workflow_initiators_position_id ON public.workflow_initiators (position_id);
CREATE INDEX IF NOT EXISTS idx_workflow_initiators_unit_id ON public.workflow_initiators (unit_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_attachments_workflow_step_id ON public.workflow_step_attachments (workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_changes_changed_by_employee_id ON public.workflow_step_changes (changed_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_changes_new_static_position_id ON public.workflow_step_changes (new_static_position_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_changes_old_static_position_id ON public.workflow_step_changes (old_static_position_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_static_position_id ON public.workflow_steps (static_position_id);

-- ----------------------------------------------------------------------------
-- 5) Tablo yetkisi hijyeni
-- ----------------------------------------------------------------------------
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
REVOKE ALL ON public.sharepoint_sync_queue, public.user_ms_tokens FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_user_approval_history, public.v_user_pending_approvals FROM authenticated;

-- ----------------------------------------------------------------------------
-- Doğrulama (beklenmeyen durumda geri alınır)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v text; n int;
BEGIN
  -- public'te authenticated'ın çalıştırabildiği SECURITY DEFINER: yalnız bilinçli olanlar
  SELECT string_agg(p.proname, ', ') INTO v
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.prosecdef
    AND pg_get_function_result(p.oid) <> 'trigger'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('can_act_on_approval', 'create_notification');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Beklenmeyen açık SECURITY DEFINER: %', v; END IF;

  -- TO public politika kalmamalı
  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND NOT (roles <@ ARRAY['authenticated']::name[]);
  IF n > 0 THEN RAISE EXCEPTION 'authenticated dışı role bağlı % politika kaldı', n; END IF;

  -- Kapsayan indeksi olmayan FK kalmamalı
  SELECT string_agg(con.conname, ', ') INTO v
  FROM pg_constraint con
  WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = con.conrelid
        AND (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] @> con.conkey
        AND (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] <@ con.conkey);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'İndekssiz FK kaldı: %', v; END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Not: Bu scriptten sonra perf_rls_1 / perf_rls_2 arşivleri yeniden
-- çalıştırılmamalıdır (fonksiyonları public'te oluşturur). Yeni politika
-- yazarken: (SELECT private.get_current_employee_id()), private.rls_* .
-- ----------------------------------------------------------------------------
