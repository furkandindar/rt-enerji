-- ============================================================================
-- SERTLEŞTİRME 2/2: iş akışı durumunu yalnız sunucu yazar
-- ============================================================================
--
-- Önkoşul: hardening_1_private_schema_policies_indexes.sql (private şeması) ve
-- bu scriptle aynı committe gelen KOD canlıda olmalı (kod bu yazımları artık
-- service role ile yapıyor; eski kod bu script sonrası talep oluşturamaz/onaylayamaz).
-- Sıra: DEV (script + e2e) → PROD deploy (kod) → PROD script.
--
-- Bulgu (2026-11-12, prod politikalarından): giriş yapmış bir çalışan, uygulamayı
-- atlayıp PostgREST'e doğrudan istek atarak
--   - kendi talebinin status'unu 'APPROVED'/'COMPLETED' yapabiliyordu
--     (requests_update: talep sahibi her kolonu yazabiliyordu; onay zincirinde
--     bir kez yer almış her onaycı da),
--   - kendi talebine istediği onaycı adına 'APPROVED' onay satırı ekleyebiliyordu
--     (request_approvals_insert: talep sahibi dalı) → PDF'te sahte imza,
--   - doğrudan 'APPROVED' statülü talep oluşturabiliyordu (requests_insert yalnız
--     talep sahibini kontrol ediyordu),
--   - herhangi bir kullanıcı adına bildirim yazabiliyordu (notifications_insert_any
--     WITH CHECK (true) + create_notification RPC),
--   - kendi çalışan kaydında ad/soyad/e-posta/durum gibi tüm alanları değiştirebiliyordu
--     (employees_update_own_signature tüm kolonlara açıktı),
--   - onay sırası kendisindeyken talebin detay satırını (ör. avans tutarı) her
--     kolonuyla değiştirebiliyordu (detay tablolarının onaycı dalları),
--   - görmediği bir talebe ek kaydı ekleyebiliyordu (ra_insert talebi kontrol etmiyordu).
-- Uygulama arayüzü bunların hiçbirini yapmaz; açık, veritabanının bunlara izin vermesiydi.
--
-- Mimari kural (CLAUDE.md "İş akışı durumu yalnız sunucuda"):
--   - requests (durum/adım/PDF/SharePoint/denetim alanları) ve request_approvals'ı
--     yalnız sunucu (service role) yazar; route yetkiyi kendisi doğrular (onay için
--     can_act_on_approval kullanıcının oturumunda çözülür).
--   - Oturum (authenticated) yalnız: PENDING + 1. adım talep oluşturur; detay
--     satırını DRAFT/REVISION_REQUESTED'ta (talep sahibi) veya admin olarak düzenler;
--     bildirimini okundu işaretler; kendi imza alanlarını değiştirir.
--   - Okuma görünürlüğü (SELECT politikaları) bugünkü kullanıcılar için DEĞİŞMEZ
--     (H bölümü yalnız kurum üyesi olmayan hesapları — bugün 0 — kapsar).
--
-- Önce DEV, sonra PROD.
-- DEV: 2026-11-12 uygulandı (dev'de üç parça: hardening_2 + 2b requests_insert
--      yardımcı fonksiyonu + 2c üyelik; bu dosya üçünün birleşik hâlidir).
--      Saldırı testi (scratchpad e2e-tamper.mjs): önce 12 senaryo AÇIK → sonra 12/12
--      ENGELLENDİ, akışlar (oluştur/geri çek/yeniden gönder/iptal/red/tam onay/PDF/
--      bildirim) 35/35; e2e 80/80; RLS görünürlüğü 46 tablo × tüm kullanıcılar birebir;
--      dışarıdan hesap simülasyonu: example.com → rol NONE, hiçbir kurum verisi yok.
--      Yeni kod eski DB ile de çalışır (DB'den önce deploy edilebilir — doğrulandı).
-- PROD: 2026-11-12 uygulandı (kod b1927f4 Vercel'de canlıya çıktıktan sonra, kullanıcı
--       onayıyla; dashboard'da e-posta sağlayıcısı kapatıldı, Azure kiracısı doğrulandı).
--       RLS altında 77 kullanıcı × 46 tablo (817.815 satır) önce/sonra birebir aynı.
--       Gerçek kullanıcı kimliğiyle, geri alınan transaction içinde saldırı yoklaması:
--       10/10 senaryo 42501 ile engellendi; okundu işareti, imza alanı ve
--       can_act_on_approval çalışıyor. Security advisor: authenticated SECURITY DEFINER
--       14 → 1 (bilinçli can_act_on_approval).
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regprocedure('private.get_current_employee_id()') IS NULL THEN
    RAISE EXCEPTION 'Önce hardening_1_private_schema_policies_indexes.sql uygulanmalı';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- A) requests — oturum yalnız PENDING / 1. adım talep oluşturur
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS requests_update ON public.requests;
REVOKE INSERT, UPDATE, DELETE ON public.requests FROM authenticated;
GRANT INSERT (workflow_definition_id, requester_employee_id, status, current_step, submitted_at, parent_request_id)
  ON public.requests TO authenticated;

-- Bağlı alt talep (görev → avans) yalnız kendi talebine bağlanır. Kontrol
-- SECURITY DEFINER yardımcıda: politika içinde requests'e doğrudan alt sorgu
-- "infinite recursion detected in policy" verir (dev'de yakalandı).
CREATE OR REPLACE FUNCTION private.rls_owns_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = p_request_id
      AND r.requester_employee_id = private.get_current_employee_id()
  )
$$;
REVOKE ALL ON FUNCTION private.rls_owns_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_owns_request(uuid) TO authenticated, service_role;

ALTER POLICY requests_insert ON public.requests
  WITH CHECK (
    requester_employee_id = (SELECT private.get_current_employee_id())
    AND status = 'PENDING'::request_status
    AND current_step = 1
    AND (parent_request_id IS NULL OR private.rls_owns_request(parent_request_id))
  );

-- ----------------------------------------------------------------------------
-- B) request_approvals — yalnız sunucu yazar
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS request_approvals_insert ON public.request_approvals;
DROP POLICY IF EXISTS request_approvals_update ON public.request_approvals;
REVOKE INSERT, UPDATE, DELETE ON public.request_approvals FROM authenticated;

-- ----------------------------------------------------------------------------
-- C) Detay tabloları — onaycı dalları kaldırılır (adımda doldurulan alanları
--    onay ucu sunucuda yazar); talep sahibi yalnız DRAFT/REVISION_REQUESTED'ta,
--    admin her zaman. stamp_requests'i talep sahibi düzenleme ucu da service role
--    ile yazar → yalnız admin.
-- ----------------------------------------------------------------------------
ALTER POLICY leave_requests_update ON public.leave_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = leave_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = leave_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))));

ALTER POLICY separation_requests_update ON public.separation_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = separation_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = separation_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))));

ALTER POLICY onboarding_requests_update ON public.onboarding_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = onboarding_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = onboarding_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))));

ALTER POLICY salary_advance_requests_update ON public.salary_advance_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = salary_advance_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = salary_advance_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))));

ALTER POLICY travel_assignment_requests_update ON public.travel_assignment_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = travel_assignment_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = travel_assignment_requests.request_id
      AND ((r.requester_employee_id = (SELECT private.get_current_employee_id())
            AND r.status = ANY (ARRAY['DRAFT', 'REVISION_REQUESTED']::request_status[]))
           OR (SELECT private.rls_is_org_admin()))));

ALTER POLICY stamp_requests_update ON public.stamp_requests
  USING ((SELECT private.rls_is_org_admin()))
  WITH CHECK ((SELECT private.rls_is_org_admin()));

-- ----------------------------------------------------------------------------
-- D) notifications — yalnız sunucu oluşturur; oturum yalnız is_read'i değiştirir
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_any ON public.notifications;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- E) employees — admin olmayan oturum kendi kaydında yalnız imza alanlarını değiştirir
--    (admin düzenlemesi employees_update_admin ile aynen devam eder)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.employees_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT private.rls_is_org_admin() THEN
    IF (to_jsonb(NEW) - ARRAY['signature_path', 'signature_text', 'signature_font', 'updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['signature_path', 'signature_text', 'signature_font', 'updated_at']) THEN
      RAISE EXCEPTION 'Kendi çalışan kaydınızda yalnız imza alanları değiştirilebilir'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.employees_guard_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_guard_self_update ON public.employees;
CREATE TRIGGER employees_guard_self_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.employees_guard_self_update();

-- ----------------------------------------------------------------------------
-- F) request_attachments — ek yalnız görülebilen bir talebe eklenir
-- ----------------------------------------------------------------------------
ALTER POLICY ra_insert ON public.request_attachments
  WITH CHECK (
    uploaded_by = (SELECT private.get_current_employee_id())
    AND EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_attachments.request_id)
  );

-- ----------------------------------------------------------------------------
-- G) Artık hiçbir politikanın kullanmadığı yardımcılar authenticated'a kapanır
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION private.approval_stored_approver(uuid), private.is_approver_for_request(uuid)
  FROM authenticated;

-- ----------------------------------------------------------------------------
-- H) Üyelik: "giriş yapmış" ≠ "kurum üyesi"
--    Bulgu (2026-11-12): prod Auth'ta e-posta sağlayıcısı açık ve kayıt kapalı
--    değil; dışarıdan biri kendi e-postasıyla kayıt olunca handle_auth_user_created
--    ona varsayılan ORG_VIEWER veriyordu → çalışan rehberi + kısıtsız süreçlerin
--    tüm talepleri. Kök çözüm Auth ayarıdır (e-posta sağlayıcısı kapalı, Azure tek
--    kiracı — dashboard). Bu bölüm veritabanı tarafındaki ikinci savunma hattı:
--      - üye = app_users.role ORG_ADMIN/ORG_VIEWER; geniş görünürlük dalları
--        (kısıtsız süreç, app_users rehberi, süreç yapılandırması) üyelik ister,
--      - yeni hesap yalnız bir çalışanla eşleşirse veya şirket alan adındaysa
--        ORG_VIEWER alır; aksi halde 'NONE' (hiçbir şey görmez, admin rol verebilir).
--    Bugünkü 77 kullanıcının hepsi rtenerji.com + ORG_VIEWER/ORG_ADMIN → davranış
--    değişmez (dev+prod RLS fotoğrafıyla doğrulanır).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.member_email_domains()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['rtenerji.com'] $$;
REVOKE ALL ON FUNCTION private.member_email_domains() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_email_domains() TO service_role;

CREATE OR REPLACE FUNCTION private.rls_is_member()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role IN ('ORG_ADMIN', 'ORG_VIEWER')
  )
$$;
REVOKE ALL ON FUNCTION private.rls_is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_is_member() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.rls_viewable_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wd.id
  FROM public.workflow_definitions wd
  WHERE EXISTS (
          SELECT 1 FROM public.app_users
          WHERE id = auth.uid() AND role = 'ORG_ADMIN'
        )
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
$$;

-- Politikada kullanılmıyor ama aynı kuralın tekil karşılığı; tutarlı kalsın
CREATE OR REPLACE FUNCTION private.can_view_workflow_requests(p_workflow_definition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE id = auth.uid() AND role = 'ORG_ADMIN'
  )
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
$$;

ALTER POLICY app_users_select_all ON public.app_users
  USING ((SELECT private.rls_is_member()) OR id = (SELECT auth.uid()));
ALTER POLICY workflow_initiators_select_all ON public.workflow_initiators
  USING ((SELECT private.rls_is_member()));
ALTER POLICY wsa_select ON public.workflow_step_attachments
  USING ((SELECT private.rls_is_member()));

-- Yeni hesap: çalışanla eşleşen veya şirket alan adındaki e-posta → ORG_VIEWER,
-- aksi halde 'NONE'. (Eski hesap birleştirme dalı aynen korunur.)
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_employee_id uuid;
  v_old_user_id uuid;
  v_old_role    text;
  v_role        text;
begin
  -- Email varsa, employees tablosunda eşleşen çalışanı bulmaya çalış
  if new.email is not null then
    select e.id
      into v_employee_id
      from public.employees e
     where lower(e.email) = lower(new.email)
     limit 1;
  end if;

  -- Eğer eşleşen bir çalışan varsa, aynı employee_id ile eski app_users kaydı var mı kontrol et
  if v_employee_id is not null then
    select au.id, au.role
      into v_old_user_id, v_old_role
      from public.app_users au
     where au.employee_id = v_employee_id
       and au.id <> new.id  -- Yeni kullanıcıdan farklı olan eski kayıt
     limit 1;

    if v_old_user_id is not null then
      -- Eski kullanıcıya ait bildirimleri yeni kullanıcıya taşı
      update public.notifications
         set user_id = new.id
       where user_id = v_old_user_id;

      -- Eski app_users kaydını sil (auth.users cascade ile silinecek)
      delete from public.app_users where id = v_old_user_id;

      -- Eski auth.users kaydını sil
      delete from auth.users where id = v_old_user_id;

      -- Yeni app_users kaydını eski rolü koruyarak oluştur
      insert into public.app_users (id, email, employee_id, role)
      values (new.id, new.email, v_employee_id, v_old_role)
      on conflict do nothing;

      return new;
    end if;
  end if;

  -- Normal akış: kurum üyesi (çalışanla eşleşen veya şirket alan adı) ORG_VIEWER,
  -- diğerleri 'NONE' — hiçbir şey görmez; gerekiyorsa admin rol verir.
  v_role := case
    when v_employee_id is not null then 'ORG_VIEWER'
    when lower(split_part(coalesce(new.email, ''), '@', 2)) = any (private.member_email_domains()) then 'ORG_VIEWER'
    else 'NONE'
  end;

  insert into public.app_users (id, email, employee_id, role)
  values (new.id, new.email, v_employee_id, v_role)
  on conflict do nothing;

  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Doğrulama (beklenmeyen durumda geri alınır)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  -- Bugün üye olmayan kullanıcı olmamalı (H bölümü kimsenin görünürlüğünü değiştirmez)
  SELECT string_agg(DISTINCT role, ', ') INTO v FROM public.app_users WHERE role NOT IN ('ORG_ADMIN', 'ORG_VIEWER');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Üye olmayan rol var (%): önce kullanıcıyla konuş', v; END IF;

  -- İş akışı tablolarında authenticated'ın tablo düzeyi yazma yetkisi kalmamalı
  SELECT string_agg(t || ':' || p, ', ') INTO v
  FROM (VALUES ('requests'), ('request_approvals'), ('notifications')) AS x(t)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS y(p)
  WHERE has_table_privilege('authenticated', ('public.' || t)::regclass, p);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Beklenmeyen tablo yazma yetkisi: %', v; END IF;

  -- Kaldırılan yardımcılara başvuran politika kalmamalı
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v FROM pg_policies
  WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '(approval_stored_approver|is_approver_for_request)';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Kapatılan fonksiyonu kullanan politika: %', v; END IF;

  -- public'te authenticated'ın çalıştırabildiği SECURITY DEFINER: yalnız can_act_on_approval
  SELECT string_agg(p.proname, ', ') INTO v
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.prosecdef
    AND pg_get_function_result(p.oid) <> 'trigger'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname <> 'can_act_on_approval';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Beklenmeyen açık SECURITY DEFINER: %', v; END IF;
END $$;

COMMIT;
