-- ============================================================================
-- @mention bildirimi — 2/2: kayıt tablosu + "talebi kim görebilir" fonksiyonu
-- ============================================================================
--
-- İstek (BYS feedback, 2026-10-18): onay / red / revize notlarında ve talep
-- sahibinin Revize Açıklaması'nda @ ile anılan kişiye e-posta + uygulama içi
-- bildirim gitsin. Prod'da 31 notta kullanıcılar zaten elle "@İsim" yazıyordu;
-- anılanların çoğu onay zincirinde değil (asistan, satın alma vb.).
--
-- Model:
--   1) request_mentions — kim, kimi, hangi notta (approval satırı) andı ve
--      bildirim ne zaman/nasıl ulaştı. Denetim izi + tekrar denemede çift
--      bildirim engeli (UNIQUE approval_id + mentioned_employee_id).
--      Yazma yalnız service role (sunucu) — tabloda INSERT/UPDATE policy yok.
--   2) employees_who_can_view_request() — anılabilecek kişiler = talebi ZATEN
--      görebilenler. Yetki modeli DEĞİŞMEZ; kimseye yeni erişim açılmaz.
--      requests_select RLS'inin (requester / is_approver_for_request /
--      ORG_ADMIN / can_view_workflow_requests) çalışan-parametreli birebir
--      karşılığıdır. requests_select veya can_view_workflow_requests değişirse
--      (ör. is_restricted=false görünürlüğü daraltılırsa) BU FONKSİYON DA
--      güncellenmeli. Yalnız service_role çalıştırabilir.
--
-- Deploy sırası: 1/2 (enum) → bu dosya → kod deploy. Kod bu nesneler yokken
-- karar akışını bozmaz (anma işlemi ayrı ve hata yutularak çalışır), ancak
-- aday listesi boş gelir ve bildirim gitmez.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Anma kaydı
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_mentions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  approval_id               uuid NOT NULL REFERENCES public.request_approvals(id) ON DELETE CASCADE, -- notun bulunduğu satır
  source                    text NOT NULL CHECK (source IN ('DECISION', 'REVISION_RESPONSE')),
  mentioned_employee_id     uuid NOT NULL REFERENCES public.employees(id),
  mentioned_by_employee_id  uuid NOT NULL REFERENCES public.employees(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  notified_at               timestamptz,  -- NULL = henüz bildirilmedi (hata → log)
  notified_via              text CHECK (notified_via IN ('MENTION', 'ACTION')),
  CONSTRAINT request_mentions_unique_per_note UNIQUE (approval_id, mentioned_employee_id)
);

COMMENT ON TABLE public.request_mentions IS
  'Onay/red/revize notlarında ve Revize Açıklaması''nda @ ile anılan kişiler. '
  'Yazma yalnız sunucu (service role).';
COMMENT ON COLUMN public.request_mentions.notified_via IS
  'MENTION: ayrı "sizden bahsedildi" bildirimi gitti. '
  'ACTION: kişi aynı aksiyonda notu içeren asıl bildirimi zaten aldı (ör. revizede talep sahibi), ayrıca gönderilmedi.';

CREATE INDEX IF NOT EXISTS idx_request_mentions_mentioned
  ON public.request_mentions (mentioned_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_mentions_request
  ON public.request_mentions (request_id);

ALTER TABLE public.request_mentions ENABLE ROW LEVEL SECURITY;

-- Okuma: anılan kişi veya talebi görebilen herkes (requests RLS'i alt sorguda uygulanır).
DROP POLICY IF EXISTS request_mentions_select ON public.request_mentions;
CREATE POLICY request_mentions_select ON public.request_mentions
  FOR SELECT TO authenticated
  USING (
    mentioned_employee_id = public.get_current_employee_id()
    OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_mentions.request_id)
  );

-- Yetkiler request_extra_approvers ile aynı kalıp: istemci yalnız okur (RLS), yazma
-- yalnız sunucu. TRUNCATE RLS'e tabi olmadığından varsayılan yetki ayrıca kaldırılır.
REVOKE ALL ON public.request_mentions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.request_mentions FROM authenticated;
GRANT SELECT ON public.request_mentions TO authenticated;
GRANT ALL ON public.request_mentions TO service_role;

-- ----------------------------------------------------------------------------
-- 2) Talebi görebilen çalışanlar (requests_select RLS'inin karşılığı)
-- ----------------------------------------------------------------------------
-- p_employee_ids NULL → tüm çalışanlar arasından; dolu → yalnız verilenler arasından.
-- Aktiflik / sistem hesabı filtresi burada değil, uygulamada (aday listesi kuralı).
CREATE OR REPLACE FUNCTION public.employees_who_can_view_request(
  p_request_id uuid,
  p_employee_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
      -- ORG_ADMIN (requests_select + can_view_workflow_requests)
      OR EXISTS (
        SELECT 1 FROM public.app_users au
        WHERE au.employee_id = e.id AND au.role = 'ORG_ADMIN'
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

COMMENT ON FUNCTION public.employees_who_can_view_request(uuid, uuid[]) IS
  'requests_select RLS''inin çalışan-parametreli karşılığı (@mention adayları). '
  'requests_select / can_view_workflow_requests değişirse birlikte güncellenmeli.';

-- Kimin hangi talebi görebildiği bilgisi istemciye açılmaz: yalnız sunucu.
REVOKE ALL ON FUNCTION public.employees_who_can_view_request(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employees_who_can_view_request(uuid, uuid[]) TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- Doğrulama (salt okuma)
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM public.request_mentions;                       -- 0
-- SELECT has_table_privilege('authenticated', 'public.request_mentions', 'TRUNCATE'); -- false
-- SELECT has_table_privilege('service_role', 'public.request_mentions', 'INSERT');    -- true
-- SELECT has_function_privilege('authenticated',
--   'public.employees_who_can_view_request(uuid, uuid[])', 'EXECUTE'); -- false
-- -- Kısıtsız bir talepte tüm çalışanlar, kısıtlı bir talepte yalnız ilgililer dönmeli:
-- SELECT count(*) FROM public.employees_who_can_view_request('<request_id>');
