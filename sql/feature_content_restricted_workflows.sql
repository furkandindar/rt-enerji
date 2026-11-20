-- ============================================================================
-- İçerik kısıtlı süreçler: İşe Giriş Onay / İşten Çıkış Onay
-- ============================================================================
--
-- Talep (2026-11-20, şirket — acil): bu iki formun İÇERİĞİNİ yalnız İnsan
-- Kaynakları ekibi ve Bekir Bey (Genel Müdür) görür. Onay zincirindeki diğer
-- kişiler (Asistan, Hukuk Müşaviri) ve admin kullanıcılar talebi ve kendi onay
-- adımını görür/onaylar ama içeriği (form, ekler, PDF) göremez.
--
-- Model (genel, ayarlanabilir):
--   workflow_definitions.content_restricted = true olan süreçte içeriği görenler:
--     - talep sahibi,
--     - süreci başlatabilenler (workflow_initiators — burada İK birimi),
--     - workflow_content_viewers'ta listelenen pozisyon/birimler (burada Genel Müdür).
--   Admin rolü içerik yetkisi VERMEZ (Bekir Bey, admin olduğu için değil Genel Müdür
--   pozisyonunda olduğu için görür).
--   Talep başlığı (requests satırı) görünürlüğü DEĞİŞMEZ: zincir ve admin talebi
--   görür, kendi adımını işler.
--
-- Uygulama katmanları:
--   - RLS: detay tabloları (onboarding/separation_approval_requests), ek kayıtları
--     (ra_select), PDF dosyası (storage "Users can view related request PDFs").
--   - public.can_view_request_content(): SECURITY INVOKER — kod (PDF/ek uçları,
--     service-role ile okunan onay detayı) tek kaynaktan sorar.
--
-- Önce DEV, sonra PROD.
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 1) Yapılandırma
-- ----------------------------------------------------------------------------
ALTER TABLE public.workflow_definitions
  ADD COLUMN IF NOT EXISTS content_restricted boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.workflow_definitions.content_restricted IS
  'true: içerik (detay formu, ekler, PDF) yalnız talep sahibi + workflow_initiators + workflow_content_viewers; onay zinciri ve admin yalnız başlık + kendi adımı';

CREATE TABLE IF NOT EXISTS public.workflow_content_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id),
  unit_id uuid REFERENCES public.organizational_units(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_content_viewers_one_target CHECK ((position_id IS NULL) <> (unit_id IS NULL))
);
COMMENT ON TABLE public.workflow_content_viewers IS
  'content_restricted süreçlerde içeriği ayrıca görebilecek pozisyon/birimler (başlatıcılara ek)';
CREATE INDEX IF NOT EXISTS idx_workflow_content_viewers_workflow ON public.workflow_content_viewers (workflow_definition_id);
CREATE INDEX IF NOT EXISTS idx_workflow_content_viewers_position ON public.workflow_content_viewers (position_id);
CREATE INDEX IF NOT EXISTS idx_workflow_content_viewers_unit ON public.workflow_content_viewers (unit_id);

ALTER TABLE public.workflow_content_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_content_viewers FROM anon, authenticated;
GRANT SELECT ON public.workflow_content_viewers TO authenticated;
DROP POLICY IF EXISTS workflow_content_viewers_select ON public.workflow_content_viewers;
CREATE POLICY workflow_content_viewers_select ON public.workflow_content_viewers
  FOR SELECT TO authenticated USING ((SELECT private.rls_is_org_admin()));

-- ----------------------------------------------------------------------------
-- 2) Küme yardımcıları (sorgu başına bir kez)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.rls_content_restricted_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wd.id FROM public.workflow_definitions wd WHERE wd.content_restricted
$$;

-- Çağıranın içeriği görebildiği kısıtlı süreçler: başlatıcı pozisyon/birimi veya
-- workflow_content_viewers pozisyon/birimi (aktif pozisyonları üzerinden).
CREATE OR REPLACE FUNCTION private.rls_content_viewer_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wd.id
  FROM public.workflow_definitions wd
  WHERE wd.content_restricted
    AND EXISTS (
      SELECT 1
      FROM public.employee_positions ep
      JOIN public.positions p ON p.id = ep.position_id
      WHERE ep.employee_id = private.get_current_employee_id()
        AND ep.end_date IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.workflow_initiators wi
            WHERE wi.workflow_definition_id = wd.id
              AND ((wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
                OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id))
          )
          OR EXISTS (
            SELECT 1 FROM public.workflow_content_viewers cv
            WHERE cv.workflow_definition_id = wd.id
              AND ((cv.position_id IS NOT NULL AND cv.position_id = ep.position_id)
                OR (cv.unit_id IS NOT NULL AND cv.unit_id = p.unit_id))
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION private.rls_content_restricted_workflow_ids(), private.rls_content_viewer_workflow_ids()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_content_restricted_workflow_ids(), private.rls_content_viewer_workflow_ids()
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) Kodun tek kaynaktan sorduğu karar (SECURITY INVOKER: talep satırı çağıranın
--    RLS'iyle okunur → talebi göremeyen için de false)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_request_content(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = p_request_id
      AND (
        r.workflow_definition_id NOT IN (SELECT private.rls_content_restricted_workflow_ids())
        OR r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_request_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_request_content(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) RLS: içerik taşıyan tablolar
-- ----------------------------------------------------------------------------
ALTER POLICY onboarding_approval_requests_select ON public.onboarding_approval_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = onboarding_approval_requests.request_id
      AND (
        r.workflow_definition_id NOT IN (SELECT private.rls_content_restricted_workflow_ids())
        OR r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
      )
  ));

ALTER POLICY separation_approval_requests_select ON public.separation_approval_requests
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = separation_approval_requests.request_id
      AND (
        r.workflow_definition_id NOT IN (SELECT private.rls_content_restricted_workflow_ids())
        OR r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
      )
  ));

-- Ek kayıtları: mevcut görünürlük + içerik kuralı
ALTER POLICY ra_select ON public.request_attachments
  USING (EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_attachments.request_id
      AND (
        r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR (SELECT private.rls_is_org_admin())
        OR r.workflow_definition_id IN (SELECT private.rls_viewable_workflow_ids())
        OR r.id IN (
          SELECT ra2.request_id FROM public.request_approvals ra2
          WHERE ra2.approver_employee_id = (SELECT private.get_current_employee_id())
        )
      )
      AND (
        r.workflow_definition_id NOT IN (SELECT private.rls_content_restricted_workflow_ids())
        OR r.requester_employee_id = (SELECT private.get_current_employee_id())
        OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
      )
  ));

-- Talep PDF'i (Storage): talep sahibi dalı aynen; onaycı dalı içerik kuralına tabi
ALTER POLICY "Users can view related request PDFs" ON storage.objects
  USING (
    bucket_id = 'request-documents'
    AND (
      EXISTS (
        SELECT 1
        FROM public.app_users au
        JOIN public.employees e ON e.id = au.employee_id
        JOIN public.requests r ON r.requester_employee_id = e.id
        WHERE au.id = (SELECT auth.uid()) AND r.pdf_path = objects.name
      )
      OR EXISTS (
        SELECT 1
        FROM public.app_users au
        JOIN public.employees e ON e.id = au.employee_id
        JOIN public.request_approvals ra ON ra.approver_employee_id = e.id
        JOIN public.requests r ON r.id = ra.request_id
        WHERE au.id = (SELECT auth.uid()) AND r.pdf_path = objects.name
          AND (
            r.workflow_definition_id NOT IN (SELECT private.rls_content_restricted_workflow_ids())
            OR r.workflow_definition_id IN (SELECT private.rls_content_viewer_workflow_ids())
          )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5) İki İK onay formunu kısıtla; Genel Müdür adımının pozisyonu içerik görür
--    (prod: Genel Müdür = Bekir Bey; dev: aynı adımın test pozisyonu)
-- ----------------------------------------------------------------------------
UPDATE public.workflow_definitions
   SET content_restricted = true
 WHERE code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL');

INSERT INTO public.workflow_content_viewers (workflow_definition_id, position_id, note)
SELECT ws.workflow_definition_id, ws.static_position_id,
       'Genel Müdür (Bekir Bey) — içerik yalnız İK + GM (2026-11-20)'
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL')
  AND ws.name = 'Genel Müdür'
  AND ws.static_position_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workflow_content_viewers cv
    WHERE cv.workflow_definition_id = ws.workflow_definition_id
      AND cv.position_id = ws.static_position_id
  );

-- ----------------------------------------------------------------------------
-- Doğrulama
-- ----------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.workflow_definitions
  WHERE code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL') AND content_restricted;
  IF n <> 2 THEN RAISE EXCEPTION 'content_restricted beklenen 2 süreç, bulunan %', n; END IF;

  SELECT count(*) INTO n FROM public.workflow_content_viewers cv
  JOIN public.workflow_definitions wd ON wd.id = cv.workflow_definition_id
  WHERE wd.code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL');
  IF n <> 2 THEN RAISE EXCEPTION 'workflow_content_viewers beklenen 2 satır, bulunan %', n; END IF;

  SELECT count(*) INTO n FROM public.workflow_definitions WHERE content_restricted;
  IF n <> 2 THEN RAISE EXCEPTION 'Beklenmeyen kısıtlı süreç sayısı: %', n; END IF;
END $$;

COMMIT;
