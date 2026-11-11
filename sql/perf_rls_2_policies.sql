-- ============================================================================
-- RLS performansı 2/2: politikalar küme tabanlı görünürlüğe geçer
-- ============================================================================
--
-- Önkoşul: perf_rls_1_visibility_helpers.sql.
-- Davranış (kim neyi görür) DEĞİŞMEZ; yalnız hesaplama biçimi değişir. Eşdeğerlik
-- uygulanmadan önce gerçek veride tüm kullanıcılar için eski ↔ yeni ifade
-- karşılaştırmasıyla doğrulandı (fark = 0), uygulandıktan sonra RLS altında
-- kullanıcı başına görünen kayıt sayıları önce/sonra karşılaştırıldı.
--
-- A) Pahalı yol (açık yeniden yazım):
--   - requests_select: ucuz kontroller önde; is_approver_for_request /
--     can_view_workflow_requests satır başına değil, sorgu başına küme.
--   - request_approvals_select, ra_select (ekler): aynı kurallar, küme tabanlı.
--   - 8 detay tablosu, requests görünürlüğünü KOPYALAMAK yerine doğrudan üst kayda
--     bağlanır (EXISTS üst kayıt → üst kaydın RLS'i uygulanır). Eski hâlde koşul hem
--     politikada hem requests RLS'inde iki kez çalışıyordu (sonuç aynı: üst talep
--     görünürse satır görünür).
-- B) Kalan tüm public politikalar (Supabase advisor `auth_rls_initplan`):
--   auth.uid() / get_current_employee_id() → (SELECT ...) — sorgu başına bir kez.
--   STABLE fonksiyon, aynı ifade içinde aynı değeri döner → anlam aynı.
--
-- Önce DEV, sonra PROD.
--
-- Doğrulama (2026-11-11):
--   DEV: uygulandı. RLS altında 9 kullanıcı × 46 tablo görünen kayıt kimlikleri
--        önce/sonra birebir aynı (21.547 satır); 12 sentetik aktif vekaletle de
--        eşdeğerlik testi 0 fark; uçtan uca testler 79/79; ham çağrı kalan politika 0.
--   PROD: eski ↔ yeni ifade eşdeğerliği 77 kullanıcı + anon, ana 3 tablo + 8 detay
--        tablosu, ~1,23 milyon satır değerlendirmesi → 0 fark. Simülasyon: finans
--        kapağı ağır liste sorgusu 7.958 ms → 33,6 ms.
--   PROD uygulaması: auto-mode classifier reddetti → kullanıcı onayı / SQL editor.
--   Acil geri alma: perf_rls_2_rollback_prod_snapshot.sql (139 politikanın eski metni).
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- A1) requests
--   eski: requester = me OR is_approver_for_request(id) OR admin OR can_view(wd)
-- ----------------------------------------------------------------------------
ALTER POLICY requests_select ON public.requests
  USING (
    requester_employee_id = (SELECT public.get_current_employee_id())
    OR (SELECT public.rls_is_org_admin())
    OR workflow_definition_id IN (SELECT public.rls_viewable_workflow_ids())
    OR id IN (SELECT public.rls_approver_request_ids())
  );

-- ----------------------------------------------------------------------------
-- A2) request_approvals
--   eski: approver = me OR acted_by = me OR (talep sahibiyim) OR admin
--         OR (süreci görebiliyorum) OR (aktif vekaletim var AND can_act_on_approval(id))
--   Not: onaycı yalnız kendi satırlarını görür (talebin diğer onay satırlarını değil) —
--   bu kural korunur.
-- ----------------------------------------------------------------------------
ALTER POLICY request_approvals_select ON public.request_approvals
  USING (
    approver_employee_id = (SELECT public.get_current_employee_id())
    OR acted_by_employee_id = (SELECT public.get_current_employee_id())
    OR (SELECT public.rls_is_org_admin())
    OR request_id IN (SELECT public.rls_own_or_workflow_viewable_request_ids())
    OR (
      EXISTS (
        SELECT 1 FROM public.approval_delegations d
        WHERE d.delegate_employee_id = (SELECT public.get_current_employee_id())
          AND d.status = 'ACTIVE'
          AND now() >= d.starts_at
          AND now() <  d.ends_at
      )
      AND public.can_act_on_approval(id)
    )
  );

-- ----------------------------------------------------------------------------
-- A3) request_attachments (ra_select)
--   eski: EXISTS talep (requester = me OR o talepte onaycıyım OR admin OR can_view(wd))
-- ----------------------------------------------------------------------------
ALTER POLICY ra_select ON public.request_attachments
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_attachments.request_id
        AND (
          r.requester_employee_id = (SELECT public.get_current_employee_id())
          OR (SELECT public.rls_is_org_admin())
          OR r.workflow_definition_id IN (SELECT public.rls_viewable_workflow_ids())
          OR r.id IN (
            SELECT ra2.request_id FROM public.request_approvals ra2
            WHERE ra2.approver_employee_id = (SELECT public.get_current_employee_id())
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- A4) Detay tabloları: görünürlük = üst kaydın görünürlüğü
-- ----------------------------------------------------------------------------
ALTER POLICY finance_approval_cover_requests_select ON public.finance_approval_cover_requests
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = finance_approval_cover_requests.request_id));
ALTER POLICY finance_approval_cover_items_select ON public.finance_approval_cover_items
  USING (EXISTS (
    SELECT 1 FROM public.finance_approval_cover_requests fr
    WHERE fr.id = finance_approval_cover_items.finance_request_id
  ));

ALTER POLICY accounting_approval_cover_requests_select ON public.accounting_approval_cover_requests
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = accounting_approval_cover_requests.request_id));
ALTER POLICY accounting_approval_cover_items_select ON public.accounting_approval_cover_items
  USING (EXISTS (
    SELECT 1 FROM public.accounting_approval_cover_requests ar
    WHERE ar.id = accounting_approval_cover_items.accounting_request_id
  ));

ALTER POLICY onboarding_requests_select ON public.onboarding_requests
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = onboarding_requests.request_id));
ALTER POLICY separation_requests_select ON public.separation_requests
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = separation_requests.request_id));

ALTER POLICY overtime_requests_select ON public.overtime_requests
  USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = overtime_requests.request_id));
ALTER POLICY overtime_entries_select ON public.overtime_entries
  USING (EXISTS (
    SELECT 1 FROM public.overtime_requests ot
    WHERE ot.id = overtime_entries.overtime_request_id
  ));

-- ----------------------------------------------------------------------------
-- B) Kalan tüm public politikalar: auth.uid() / get_current_employee_id() → InitPlan
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
  v_qual text;
  v_check text;
  v_sql text;
  v_count int := 0;
  -- Zaten sarılmış biçimler (pg_get_expr çıktısı) önce yer tutucuya alınır ki
  -- ikinci kez sarılmasın.
  c_uid_wrapped constant text := '( SELECT auth.uid() AS uid)';
  c_emp_wrapped constant text := '( SELECT get_current_employee_id() AS get_current_employee_id)';
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ '(auth\.uid\(\)|get_current_employee_id\(\))'
        OR coalesce(with_check, '') ~ '(auth\.uid\(\)|get_current_employee_id\(\))'
      )
  LOOP
    v_qual := pol.qual;
    v_check := pol.with_check;

    IF v_qual IS NOT NULL THEN
      v_qual := replace(replace(v_qual, c_uid_wrapped, '@@UID@@'), c_emp_wrapped, '@@EMP@@');
      v_qual := replace(replace(v_qual, 'auth.uid()', '@@UID@@'), 'get_current_employee_id()', '@@EMP@@');
      v_qual := replace(replace(v_qual, '@@UID@@', c_uid_wrapped), '@@EMP@@', c_emp_wrapped);
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := replace(replace(v_check, c_uid_wrapped, '@@UID@@'), c_emp_wrapped, '@@EMP@@');
      v_check := replace(replace(v_check, 'auth.uid()', '@@UID@@'), 'get_current_employee_id()', '@@EMP@@');
      v_check := replace(replace(v_check, '@@UID@@', c_uid_wrapped), '@@EMP@@', c_emp_wrapped);
    END IF;

    IF v_qual IS NOT DISTINCT FROM pol.qual AND v_check IS NOT DISTINCT FROM pol.with_check THEN
      CONTINUE;  -- zaten hepsi sarılı
    END IF;

    v_sql := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'initplan: % politika güncellendi', v_count;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Doğrulama (salt okuma)
-- ----------------------------------------------------------------------------
-- Ham çağrı kalmadı mı? (0 satır beklenir)
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND (
--   replace(replace(coalesce(qual,'')||coalesce(with_check,''),
--     '( SELECT auth.uid() AS uid)', ''), '( SELECT get_current_employee_id() AS get_current_employee_id)', '')
--   ~ '(auth\.uid\(\)|get_current_employee_id\(\))');
