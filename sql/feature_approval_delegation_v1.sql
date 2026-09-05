-- ============================================================================
-- FEATURE: Vekalet (Approval Delegation) — Faz B / B1 (veritabanı katmanı)
-- Tarih: 2026-09-05 | Sıra: önce DEV, doğrulama sonrası PROD
-- Plan/kararlar: docs/onay-havuzu-ve-vekalet-plan.md (Bölüm 5)
--
-- NE YAPAR
--   1) public.approval_delegations tablosu: kişi bazlı, süreli vekalet kaydı.
--      Kapsam bu aşamada yalnız FINANCE_APPROVAL_COVER (karar 8) — kısıt DB'de
--      değil kod tarafında (DELEGATION_ALLOWED_WORKFLOWS). DB genel tutuldu.
--   2) request_approvals.acted_by_employee_id: işlemi FİİLEN yapan kişi.
--      NULL = atanan onaycının kendisi (eski kayıtlar için migration yok).
--      approver_employee_id "adına" olarak DEĞİŞMEZ.
--   3) Tek yetki kaynağı: can_act_on_approval(approval_id) — "bu satırda şu an
--      kim işlem yapabilir?" (kendisi VEYA aktif vekil). RLS update politikası,
--      bekleyen onaylar view'ı ve (B2'de) route'lar bunu kullanır.
--   4) is_approver_for_request() genişletildi: vekil ve "fiilen işlem yapmış"
--      kişi talebi (ve is_approver_for_request'e bağlı 9 detay politikasını)
--      görebilir. requests_select/requests_update politikalarına dokunulmadı —
--      fonksiyon üzerinden otomatik genişler.
--   5) request_approvals select/update politikaları + iki view yeniden kuruldu.
--
-- ÇÖZÜMLEME MODELİ (karar): satır TAŞINMAZ. Vekil, delegator'ın PENDING satırını
--   vekalet penceresi içinde görür ve işler; acted_by = vekil yazılır. Vekalet
--   bitince/iptal edilince satır kendiliğinden delegator'a "geri döner".
--
-- GÜVENLİK KURALLARI (fonksiyonlarda kodlu)
--   * Transitif değil: vekilin vekili yok (tek seviye join).
--   * Self-approval engeli: vekil = talebin sahibi ise o talepte işlem yapamaz.
--   * acted_by sahteciliği engeli: UPDATE WITH CHECK, acted_by'ın ya NULL (ve
--     işlemi yapan = atanan onaycı) ya da işlemi yapan kişi olmasını zorlar.
--   * approver_employee_id değiştirilemez: WITH CHECK, satırın DB'deki mevcut
--     onaycısıyla eşitliğini arar (approval_stored_approver).
--   * Aynı delegator + aynı süreç için zaman aralığı çakışan iki ACTIVE vekalet
--     olamaz (EXCLUDE constraint, btree_gist).
--
-- BİLİNÇLİ OLARAK DOKUNULMAYANLAR
--   * storage.objects "Users can view related request PDFs" politikası: PDF'ler
--     /api/requests/[id]/pdf üzerinden uygulama-seviyesi yetki + service-role ile
--     servis ediliyor; vekil için storage politikası gerekmiyor.
--   * request_approvals_insert: zincir kurulumu talep sahibi/admin ile aynı kalır.
--   * ileriye dönük otomatik onay (forward auto-approve) kuralı kod tarafında
--     (B2): vekaleten işlemde kapalı.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu (yorumlu).
-- ============================================================================

BEGIN;

-- btree_gist opclass'ları extensions şemasında; oturum search_path'inde olmayabilir
-- (MCP oturumunda "$user", public görüldü). Yalnız bu transaction için ekle.
SET LOCAL search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 0) Uzantı: EXCLUDE constraint'te uuid için gist opclass (btree_gist).
--    Supabase'de extensions şemasına kurulur; search_path'te olduğu için
--    opclass adı vermeden çözülür.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1) approval_delegations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_delegations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_employee_id  uuid NOT NULL REFERENCES public.employees(id),
  delegate_employee_id   uuid NOT NULL REFERENCES public.employees(id),
  workflow_definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id),
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  reason                 text,
  status                 text NOT NULL DEFAULT 'ACTIVE'
                           CHECK (status IN ('ACTIVE', 'CANCELLED')),
  source                 text NOT NULL DEFAULT 'MANUAL'
                           CHECK (source IN ('MANUAL', 'LEAVE_REQUEST')),
  leave_request_id       uuid REFERENCES public.leave_requests(id),   -- Faz 2 / E2 için hazır
  created_by_user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.app_users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  cancelled_at           timestamptz,
  cancelled_by_user_id   uuid REFERENCES public.app_users(id),

  CONSTRAINT approval_delegations_not_self   CHECK (delegator_employee_id <> delegate_employee_id),
  CONSTRAINT approval_delegations_range      CHECK (ends_at > starts_at),
  -- Aynı delegator + aynı süreç için çakışan iki ACTIVE vekalet olamaz
  CONSTRAINT approval_delegations_no_overlap
    EXCLUDE USING gist (
      delegator_employee_id  WITH =,
      workflow_definition_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (status = 'ACTIVE')
);

COMMENT ON TABLE  public.approval_delegations IS
  'Vekalet: delegator izindeyken delegate onun PENDING onay satırlarını (kapsamdaki süreçte) işler. Satır taşınmaz; yetki işlem anında can_act_on_approval() ile çözülür.';
COMMENT ON COLUMN public.approval_delegations.workflow_definition_id IS
  'Vekaletin geçerli olduğu süreç. Bu aşamada kod tarafı yalnız FINANCE_APPROVAL_COVER kabul eder.';

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
  ON public.approval_delegations (delegate_employee_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
  ON public.approval_delegations (delegator_employee_id, status, starts_at, ends_at);

-- ----------------------------------------------------------------------------
-- 2) approval_delegations RLS
--    SELECT: taraflar (delegator / delegate) veya ORG_ADMIN
--    INSERT: kendi adına (delegator = ben) veya ORG_ADMIN; created_by = ben
--    UPDATE: delegator veya ORG_ADMIN (iptal / bitiş tarihini kısaltma)
--    DELETE: yok (iptal = status CANCELLED)
-- ----------------------------------------------------------------------------
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_delegations_select" ON public.approval_delegations;
CREATE POLICY "approval_delegations_select" ON public.approval_delegations
  FOR SELECT USING (
    delegator_employee_id = public.get_current_employee_id()
    OR delegate_employee_id = public.get_current_employee_id()
    OR EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN')
  );

DROP POLICY IF EXISTS "approval_delegations_insert" ON public.approval_delegations;
CREATE POLICY "approval_delegations_insert" ON public.approval_delegations
  FOR INSERT WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      delegator_employee_id = public.get_current_employee_id()
      OR EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN')
    )
  );

DROP POLICY IF EXISTS "approval_delegations_update" ON public.approval_delegations;
CREATE POLICY "approval_delegations_update" ON public.approval_delegations
  FOR UPDATE
  USING (
    delegator_employee_id = public.get_current_employee_id()
    OR EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN')
  )
  WITH CHECK (
    delegator_employee_id = public.get_current_employee_id()
    OR EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN')
  );

GRANT SELECT, INSERT, UPDATE ON public.approval_delegations TO authenticated;
GRANT ALL ON public.approval_delegations TO service_role;

-- ----------------------------------------------------------------------------
-- 3) request_approvals.acted_by_employee_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.request_approvals
  ADD COLUMN IF NOT EXISTS acted_by_employee_id uuid REFERENCES public.employees(id);

COMMENT ON COLUMN public.request_approvals.acted_by_employee_id IS
  'İşlemi fiilen yapan çalışan (vekil). NULL = atanan onaycı (approver_employee_id) kendisi yaptı.';

CREATE INDEX IF NOT EXISTS idx_request_approvals_acted_by
  ON public.request_approvals (acted_by_employee_id)
  WHERE acted_by_employee_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4) Fonksiyonlar (SECURITY DEFINER: RLS döngüsünü kırmak için — mevcut
--    get_current_employee_id / is_approver_for_request ile aynı desen)
-- ----------------------------------------------------------------------------

-- 4a) Oturumdaki kullanıcı, p_delegator adına, p_workflow sürecinde ŞU AN aktif vekil mi?
CREATE OR REPLACE FUNCTION public.is_active_delegate_for(
  p_delegator_employee_id uuid,
  p_workflow_definition_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_delegations d
    WHERE d.status = 'ACTIVE'
      AND d.delegator_employee_id  = p_delegator_employee_id
      AND d.delegate_employee_id   = public.get_current_employee_id()
      AND d.workflow_definition_id = p_workflow_definition_id
      AND now() >= d.starts_at
      AND now() <  d.ends_at
  )
$$;

-- 4b) Satırın DB'deki mevcut onaycısı (UPDATE WITH CHECK'te "approver değiştirilemez" için)
CREATE OR REPLACE FUNCTION public.approval_stored_approver(p_approval_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ra.approver_employee_id
  FROM public.request_approvals ra
  WHERE ra.id = p_approval_id
$$;

-- 4c) TEK YETKİ KAYNAĞI: bu onay satırında oturumdaki kullanıcı işlem yapabilir mi?
--     Kendisi VEYA (aktif vekil VE talebin sahibi değil).
CREATE OR REPLACE FUNCTION public.can_act_on_approval(p_approval_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_approvals ra
    JOIN public.requests r ON r.id = ra.request_id
    WHERE ra.id = p_approval_id
      AND (
        ra.approver_employee_id = public.get_current_employee_id()
        OR (
          r.requester_employee_id <> public.get_current_employee_id()   -- self-approval engeli
          AND public.is_active_delegate_for(ra.approver_employee_id, r.workflow_definition_id)
        )
      )
  )
$$;

-- 4d) is_approver_for_request genişletmesi: vekil + fiilen işlem yapmış kişi.
--     requests_select / requests_update ve 9 detay-tablo politikası bunu kullanır.
CREATE OR REPLACE FUNCTION public.is_approver_for_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_approvals ra
    JOIN public.requests r ON r.id = ra.request_id
    WHERE ra.request_id = p_request_id
      AND (
        ra.approver_employee_id = public.get_current_employee_id()
        OR ra.acted_by_employee_id = public.get_current_employee_id()
        OR public.is_active_delegate_for(ra.approver_employee_id, r.workflow_definition_id)
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_active_delegate_for(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approval_stored_approver(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_approval(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_approver_for_request(uuid)     TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) request_approvals politikaları
-- ----------------------------------------------------------------------------

-- SELECT: mevcut 4 dal (kendi satırı / talep sahibi / admin / departman
-- görüntüleyici) + vekil olarak işlem yapabildiği satır + fiilen işlem yaptığı satır
DROP POLICY IF EXISTS "request_approvals_select" ON public.request_approvals;
CREATE POLICY "request_approvals_select" ON public.request_approvals
  FOR SELECT USING (
    approver_employee_id = public.get_current_employee_id()
    OR acted_by_employee_id = public.get_current_employee_id()
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_approvals.request_id
        AND r.requester_employee_id = public.get_current_employee_id()
    )
    OR EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN')
    OR EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_approvals.request_id
        AND public.can_view_workflow_requests(r.workflow_definition_id)
    )
    -- Vekil dalı: önce ucuz, satırdan bağımsız kapı ("şu an herhangi bir aktif
    -- vekaletim var mı?") — planner bunu InitPlan olarak BİR kez değerlendirir;
    -- vekaleti olmayan kullanıcılar için satır başına fonksiyon çağrısı olmaz.
    OR (
      EXISTS (
        SELECT 1 FROM public.approval_delegations d
        WHERE d.delegate_employee_id = public.get_current_employee_id()
          AND d.status = 'ACTIVE' AND now() >= d.starts_at AND now() < d.ends_at
      )
      AND public.can_act_on_approval(id)
    )
  );

-- UPDATE: yalnız PENDING satır, yalnız işlem yapabilen kişi.
-- WITH CHECK: statü geçerli set'te; onaycı değişmemiş; acted_by sahte değil.
DROP POLICY IF EXISTS "request_approvals_update" ON public.request_approvals;
CREATE POLICY "request_approvals_update" ON public.request_approvals
  FOR UPDATE
  USING (
    status = 'PENDING'
    AND public.can_act_on_approval(id)
  )
  WITH CHECK (
    status IN ('APPROVED', 'REJECTED', 'REVISION_REQUESTED')
    AND approver_employee_id = public.approval_stored_approver(id)
    AND (
      (acted_by_employee_id IS NULL AND approver_employee_id = public.get_current_employee_id())
      OR acted_by_employee_id = public.get_current_employee_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 6) View'lar — security_invoker AÇIKÇA tekrar (CREATE OR REPLACE sıfırlayabilir)
--    Yeni kolon (acted_by_employee_id) SONA eklendi; mevcut kolonlar değişmedi.
-- ----------------------------------------------------------------------------

-- 6a) Bekleyen onaylar: kendi satırları UNION ALL vekil olarak işleyebildiği satırlar.
--     İki dal ayrı tutuldu ki her biri (approver_employee_id, status, created_at)
--     indeksini kullanabilsin (tek WHERE'de OR olsaydı indeks devre dışı kalırdı).
CREATE OR REPLACE VIEW public.v_user_pending_approvals
  WITH (security_invoker = on) AS
  SELECT ra.id,
         ra.request_id,
         ra.workflow_step_id,
         ra.approver_employee_id,
         ra.status,
         ra.comment,
         ra.decided_at,
         ra.created_at,
         ra.sequence_order,
         ra.revision_cycle,
         wd.code AS workflow_definition_code,
         ra.acted_by_employee_id
    FROM public.request_approvals ra
    JOIN public.requests r ON r.id = ra.request_id
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
   WHERE ra.approver_employee_id = public.get_current_employee_id()
     AND ra.status = 'PENDING'::approval_status
     AND r.current_step = ra.sequence_order
     AND COALESCE(r.current_revision_cycle::integer, 0) = COALESCE(ra.revision_cycle::integer, 0)
     AND r.status IN ('PENDING', 'AWAITING_COMPLETION')
  UNION ALL
  SELECT ra.id,
         ra.request_id,
         ra.workflow_step_id,
         ra.approver_employee_id,
         ra.status,
         ra.comment,
         ra.decided_at,
         ra.created_at,
         ra.sequence_order,
         ra.revision_cycle,
         wd.code AS workflow_definition_code,
         ra.acted_by_employee_id
    FROM public.approval_delegations d
    JOIN public.request_approvals ra ON ra.approver_employee_id = d.delegator_employee_id
    JOIN public.requests r ON r.id = ra.request_id
                          AND r.workflow_definition_id = d.workflow_definition_id
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
   WHERE d.delegate_employee_id = public.get_current_employee_id()
     AND d.status = 'ACTIVE'
     AND now() >= d.starts_at
     AND now() <  d.ends_at
     AND r.requester_employee_id <> public.get_current_employee_id()   -- self-approval engeli
     AND ra.status = 'PENDING'::approval_status
     AND r.current_step = ra.sequence_order
     AND COALESCE(r.current_revision_cycle::integer, 0) = COALESCE(ra.revision_cycle::integer, 0)
     AND r.status IN ('PENDING', 'AWAITING_COMPLETION');

-- 6b) Onay geçmişi: kendi verdiği kararlar + vekaleten verdiği kararlar.
--     Vekaleten dalında REQUESTER-adım filtresi uygulanmaz (talep edenin tarama
--     yükleme adımını vekil yaptıysa geçmişinde görmeli).
CREATE OR REPLACE VIEW public.v_user_approval_history
  WITH (security_invoker = on) AS
  SELECT DISTINCT ON (ra.request_id, COALESCE(ra.revision_cycle::integer, 0))
         ra.id,
         ra.request_id,
         ra.workflow_step_id,
         ra.approver_employee_id,
         ra.status,
         ra.comment,
         ra.decided_at,
         ra.created_at,
         ra.sequence_order,
         ra.revision_cycle,
         wd.code AS workflow_definition_code,
         ra.acted_by_employee_id
    FROM public.request_approvals ra
    JOIN public.workflow_steps ws ON ws.id = ra.workflow_step_id
    JOIN public.requests r ON r.id = ra.request_id
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
   WHERE ra.status IN ('APPROVED', 'REJECTED', 'REVISION_REQUESTED')
     AND (
       (ra.approver_employee_id = public.get_current_employee_id() AND ws.approver_type <> 'REQUESTER')
       OR ra.acted_by_employee_id = public.get_current_employee_id()
     )
   ORDER BY ra.request_id, COALESCE(ra.revision_cycle::integer, 0), ra.sequence_order;

GRANT SELECT ON public.v_user_pending_approvals TO authenticated;
GRANT SELECT ON public.v_user_approval_history  TO authenticated;

COMMIT;

-- ============================================================================
-- DOĞRULAMA (SELECT — uygulama sonrası çalıştır)
-- ============================================================================
-- 1) Nesneler yerinde mi?
-- SELECT
--   to_regclass('public.approval_delegations')                               AS tbl,
--   (SELECT count(*) FROM pg_policy WHERE polrelid='public.approval_delegations'::regclass) AS delegation_policies,   -- 3
--   (SELECT count(*) FROM pg_policy WHERE polrelid='public.request_approvals'::regclass)    AS approval_policies,     -- 3 (select/insert/update)
--   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='request_approvals' AND column_name='acted_by_employee_id') AS acted_by_col,
--   (SELECT reloptions FROM pg_class WHERE oid='public.v_user_pending_approvals'::regclass) AS pending_view_opts,     -- {security_invoker=on}
--   (SELECT reloptions FROM pg_class WHERE oid='public.v_user_approval_history'::regclass)  AS history_view_opts,     -- {security_invoker=on}
--   (SELECT extname FROM pg_extension WHERE extname='btree_gist')                           AS gist;
--
-- 2) Fonksiyonlar (4 satır dönmeli)
-- SELECT proname, prosecdef FROM pg_proc
-- WHERE pronamespace='public'::regnamespace
--   AND proname IN ('is_active_delegate_for','approval_stored_approver','can_act_on_approval','is_approver_for_request');
--
-- 3) Regresyon: bekleyen onaylar view'ı mevcut kullanıcılar için aynı satır
--    sayısını vermeli (SQL editor'de auth.uid() NULL olduğundan bu sorgu 0 döner;
--    gerçek doğrulama uygulamadan: Bekleyen Onaylar sayfası açılmalı, sayı değişmemeli).
--
-- 4) Çakışma kısıtı testi (DEV'de, isteğe bağlı — ikinci INSERT hata vermeli):
--    INSERT INTO approval_delegations (delegator_employee_id, delegate_employee_id, workflow_definition_id, starts_at, ends_at, created_by_user_id)
--    VALUES ('<E1>','<E2>', (SELECT id FROM workflow_definitions WHERE code='FINANCE_APPROVAL_COVER'), now(), now()+interval '7 days', '<AUTH_UID>');
--    -- aynı E1 + aynı süreç + çakışan aralık → "conflicting key value violates exclusion constraint"
-- ============================================================================

-- ============================================================================
-- GERİ ALMA (gerekirse — yorumu kaldırıp çalıştır)
-- ============================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_user_pending_approvals;
-- DROP VIEW IF EXISTS public.v_user_approval_history;
-- -- view'ları eski tanımlarıyla yeniden kur: sql/fix_pending_approvals_exclude_terminal.sql
-- -- ve sql/feature_approvals_pagination_views.sql (history) — security_invoker=on ile.
-- DROP POLICY IF EXISTS "request_approvals_update" ON public.request_approvals;
-- DROP POLICY IF EXISTS "request_approvals_select" ON public.request_approvals;
-- -- eski politikalar: sql/feature_request_lifecycle_v1_rls.sql (update) + prod'daki select tanımı
-- DROP FUNCTION IF EXISTS public.can_act_on_approval(uuid);
-- DROP FUNCTION IF EXISTS public.approval_stored_approver(uuid);
-- DROP FUNCTION IF EXISTS public.is_active_delegate_for(uuid, uuid);
-- -- is_approver_for_request: sql/workflow_engine_rls.sql'deki orijinal gövdeye döndür
-- ALTER TABLE public.request_approvals DROP COLUMN IF EXISTS acted_by_employee_id;
-- DROP TABLE IF EXISTS public.approval_delegations;
-- COMMIT;
