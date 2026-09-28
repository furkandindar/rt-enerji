-- ============================================================================
-- Olur Yazısı: Genel Müdür'ün onay zincirine ek onaycı eklemesi
-- ============================================================================
--
-- İstek (kullanıcı geri bildirimi, 2026-09-27):
--   Bekir Bey (Genel Müdür) Olur onay ekranında zincire aktif çalışanlardan bir
--   veya birden fazla ZORUNLU onaycı ekleyebilsin, kendi aralarında sıralasın.
--   Eklenenler varsayılan olarak GM'in hemen önünde onay verir. İki mod:
--     - REVISION: revize notuyla birlikte; talep sahibi düzenleyip/yeniden
--       gönderince yeni tur standart onaycılar + eklenenlerle kurulur.
--     - DIRECT:   belge değişmeden; eklenenler MEVCUT turda GM'in hemen önüne
--       girer, onlar onaylayınca sıra GM'e döner (kimse yeniden onaylamaz).
--   Talep sahibi de Olur oluştururken opsiyonel ek onaycı seçebilir.
--
-- Model:
--   1) workflow_steps.can_add_extra_approvers — hangi adımın onaycısının kişi
--      ekleyebileceği (pozisyon/adım bazlı yetki; isim bazlı değil).
--   2) Eklenen kişiler, o adımdan ÖNCEKİ en yakın DYNAMIC_USER_LIST adımına
--      yazılır ("Ek Onaycılar"). Kimse yoksa adım hiç oluşmaz → mevcut ve açık
--      talepler geriye dönük değişmez.
--   3) request_extra_approvers — yöneticinin eklediği (kilitli) kişilerin kalıcı
--      kaydı. Resubmit'te talep sahibinin seçtikleri + bu kayıtlar birleşir;
--      talep sahibi kilitli kişiyi zincirden çıkaramaz. Denetim izi de burasıdır
--      (kim, hangi turda, hangi modla, hangi notla ekledi).
--   4) insert_extra_approvers_before() — DIRECT mod: satır ekleme + sequence
--      kaydırma + kilit kaydı TEK transaction'da, talep satırı kilitli.
--      İlerleme motoru sequence_order/current_step üzerinden yürüdüğü için bu
--      adımın yarım kalması zinciri kilitlerdi → atomik olmak zorunda.
--   5) approval_queued_at — tur ortasında eklenen satırın "onaya geliş" anı,
--      önceki adımın karar anı değil ekleme anı olmalı (GREATEST).
--
-- Deploy sırası: kod bu SQL'den BAĞIMSIZ çalışır (yeni kolon/tablo/fonksiyona
-- yalnız bayrak true iken dokunulur). Önerilen: DEV → kod deploy → PROD →
-- en son Table Editor yapılandırması (aşağıda). Bayrak açılmadıkça hiçbir
-- süreçte davranış değişmez.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Adım bayrağı
-- ----------------------------------------------------------------------------
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS can_add_extra_approvers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workflow_steps.can_add_extra_approvers IS
  'true ise bu adımın onaycısı, sırası geldiğinde zincire ek onaycı ekleyebilir. '
  'Eklenenler bu adımdan önceki en yakın DYNAMIC_USER_LIST adımına yazılır.';

-- ----------------------------------------------------------------------------
-- 2) Kilitli ek onaycı kaydı
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.request_extra_approvers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  workflow_step_id      uuid NOT NULL REFERENCES public.workflow_steps(id),   -- hedef DYNAMIC_USER_LIST adımı
  employee_id           uuid NOT NULL REFERENCES public.employees(id),
  sort_order            integer NOT NULL,                                     -- talep içinde ekleme sırası
  added_by_employee_id  uuid NOT NULL REFERENCES public.employees(id),
  added_in_cycle        smallint NOT NULL,                                    -- eklendiği revize turu
  mode                  text NOT NULL CHECK (mode IN ('REVISION', 'DIRECT')),
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_extra_approvers_request_employee_key UNIQUE (request_id, employee_id)
);

COMMENT ON TABLE public.request_extra_approvers IS
  'Yöneticinin (can_add_extra_approvers adımı) onay zincirine eklediği zorunlu '
  'onaycılar. Resubmit''te talep sahibinin seçimleriyle birleştirilir; talep '
  'sahibi bunları çıkaramaz. Yazma yalnız sunucu (service role) üzerinden.';

ALTER TABLE public.request_extra_approvers ENABLE ROW LEVEL SECURITY;

-- Okuma: talebi görebilen herkes (requests RLS'i alt sorguda uygulanır →
-- talep sahibi, onaycılar, departman görüntüleyicileri, ORG_ADMIN).
DROP POLICY IF EXISTS request_extra_approvers_select ON public.request_extra_approvers;
CREATE POLICY request_extra_approvers_select
  ON public.request_extra_approvers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.requests r
       WHERE r.id = request_extra_approvers.request_id
    )
  );

-- Yazma policy'si YOK: insert/update/delete yalnız service role (API doğrulaması
-- sonrası). Savunma katmanı olarak tablo yetkileri de kısılır.
REVOKE ALL ON public.request_extra_approvers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.request_extra_approvers FROM authenticated;
GRANT SELECT ON public.request_extra_approvers TO authenticated;
GRANT ALL ON public.request_extra_approvers TO service_role;

-- ----------------------------------------------------------------------------
-- 3) DIRECT mod: mevcut tura, yöneticinin satırının hemen önüne ekleme
-- ----------------------------------------------------------------------------
-- Çağıran (API) yetkiyi, aday uygunluğunu (aktif + sistem hesabı) ve adım
-- bayrağını doğrular; bu fonksiyon DURUM tutarlılığını talep satırı kilitliyken
-- yeniden kontrol eder ve tek transaction'da uygular. Yalnız service_role
-- çalıştırabilir.
CREATE OR REPLACE FUNCTION public.insert_extra_approvers_before(
  p_before_approval_id    uuid,
  p_dynamic_step_id       uuid,
  p_employee_ids          uuid[],
  p_added_by_employee_id  uuid,
  p_note                  text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n       integer := COALESCE(array_length(p_employee_ids, 1), 0);
  v_req_id  uuid;
  v_req     public.requests%ROWTYPE;
  v_before  public.request_approvals%ROWTYPE;
  v_sort    integer;
BEGIN
  IF v_n = 0 THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_EMPTY';
  END IF;
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_employee_ids) AS x) THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_DUPLICATE';
  END IF;

  SELECT request_id INTO v_req_id
    FROM public.request_approvals
   WHERE id = p_before_approval_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_APPROVAL_NOT_FOUND';
  END IF;

  -- Talep satırını kilitle: eşzamanlı karar / iptal / ikinci ekleme serileşir.
  SELECT * INTO v_req FROM public.requests WHERE id = v_req_id FOR UPDATE;
  SELECT * INTO v_before FROM public.request_approvals WHERE id = p_before_approval_id FOR UPDATE;

  IF v_req.status <> 'PENDING'::request_status
     OR v_before.status <> 'PENDING'::approval_status
     OR v_before.revision_cycle <> v_req.current_revision_cycle
     OR v_before.sequence_order <> v_req.current_step THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_STATE_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.workflow_steps ws
     WHERE ws.id = p_dynamic_step_id
       AND ws.workflow_definition_id = v_req.workflow_definition_id
       AND ws.approver_type = 'DYNAMIC_USER_LIST'
  ) THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_INVALID_STEP';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.request_approvals ra
     WHERE ra.request_id = v_req.id
       AND ra.revision_cycle = v_req.current_revision_cycle
       AND ra.approver_employee_id = ANY (p_employee_ids)
  ) THEN
    RAISE EXCEPTION 'EXTRA_APPROVERS_ALREADY_IN_CHAIN';
  END IF;

  -- Yöneticinin satırı ve sonrası N kaydırılır. current_step değişmez: artık
  -- ilk eklenen kişiyi gösterir. sequence_order üzerinde unique kısıt yok.
  UPDATE public.request_approvals
     SET sequence_order = sequence_order + v_n
   WHERE request_id = v_req.id
     AND revision_cycle = v_req.current_revision_cycle
     AND sequence_order >= v_before.sequence_order;

  INSERT INTO public.request_approvals
    (request_id, workflow_step_id, approver_employee_id, status, sequence_order, revision_cycle)
  SELECT v_req.id,
         p_dynamic_step_id,
         e.employee_id,
         'PENDING'::approval_status,
         v_before.sequence_order + (e.ord::integer - 1),
         v_req.current_revision_cycle
    FROM unnest(p_employee_ids) WITH ORDINALITY AS e(employee_id, ord);

  SELECT COALESCE(max(sort_order), 0) INTO v_sort
    FROM public.request_extra_approvers
   WHERE request_id = v_req.id;

  INSERT INTO public.request_extra_approvers
    (request_id, workflow_step_id, employee_id, sort_order,
     added_by_employee_id, added_in_cycle, mode, note)
  SELECT v_req.id,
         p_dynamic_step_id,
         e.employee_id,
         v_sort + e.ord::integer,
         p_added_by_employee_id,
         v_req.current_revision_cycle,
         'DIRECT',
         NULLIF(btrim(p_note), '')
    FROM unnest(p_employee_ids) WITH ORDINALITY AS e(employee_id, ord);

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_extra_approvers_before(uuid, uuid, uuid[], uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_extra_approvers_before(uuid, uuid, uuid[], uuid, text)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 4) Kuyruk sırası: tur ortasında eklenen satırın onaya geliş anı
-- ----------------------------------------------------------------------------
-- sql/feature_pending_approvals_queue_order.sql ile birebir aynı; tek fark
-- COALESCE → GREATEST. Normal satırlar tur başında yaratıldığı için önceki
-- adımın karar anı ≥ created_at → sonuç değişmez. DIRECT modda sonradan
-- eklenen satırda created_at = ekleme anı > önceki kararlar → kişi kuyruğunda
-- olduğundan eski görünmez. GREATEST NULL'ları yok sayar (önceki adım yoksa
-- created_at döner, eskisiyle aynı).
CREATE OR REPLACE FUNCTION public.approval_queued_at(p_approval_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
           (SELECT max(p.decided_at)
              FROM public.request_approvals p
             WHERE p.request_id = ra.request_id
               AND COALESCE(p.revision_cycle::integer, 0) = COALESCE(ra.revision_cycle::integer, 0)
               AND p.sequence_order < ra.sequence_order),
           ra.created_at
         )
    FROM public.request_approvals ra
   WHERE ra.id = p_approval_id
     AND public.can_act_on_approval(p_approval_id)
$$;

REVOKE ALL ON FUNCTION public.approval_queued_at(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_queued_at(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Doğrulama (salt okunur)
-- ============================================================================
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'workflow_steps'
--    AND column_name = 'can_add_extra_approvers';
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'request_extra_approvers';
--
-- SELECT has_function_privilege('authenticated',
--          'public.insert_extra_approvers_before(uuid, uuid, uuid[], uuid, text)', 'EXECUTE');  -- false olmalı
--
-- ============================================================================
-- Geri alma (gerekirse; önce Table Editor'daki bayrağı kapat)
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.insert_extra_approvers_before(uuid, uuid, uuid[], uuid, text);
-- DROP TABLE IF EXISTS public.request_extra_approvers;
-- ALTER TABLE public.workflow_steps DROP COLUMN IF EXISTS can_add_extra_approvers;
-- -- approval_queued_at: sql/feature_pending_approvals_queue_order.sql'deki COALESCE sürümü
-- COMMIT;
