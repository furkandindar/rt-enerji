-- ============================================================================
-- Bekleyen Onaylar: sıralama "evrak tarihi" yerine "onaya geliş" anına göre
-- ============================================================================
--
-- Sorun (kullanıcı geri bildirimi, 2026-09-27):
--   Liste request_approvals.created_at ASC sıralanıyordu. Bir talebin (revizyon
--   turu başına) TÜM onay satırları gönderim anında tek seferde yaratıldığı için
--   created_at fiilen talebin açılış tarihi. Sonuç: 3. adımdaki onaycıya dün
--   düşen eski bir talep, bugün 1. adımından geçip gelen talebin ÖNÜNE geçiyordu.
--   İstenen: onaycının kuyruğuna en önce düşen en üstte (FIFO).
--
-- Çözüm:
--   queued_at = aynı talep + aynı revizyon turundaki önceki adımların en son
--               decided_at'i; önceki adım yoksa satırın created_at'i
--               (1. adım / resubmit — resetApprovalChain yeni turu o an yaratır).
--   Koşullu skip edilen adımların satırı olmadığı için doğal olarak atlanır.
--
-- Neden SECURITY DEFINER fonksiyon:
--   View security_invoker=on. request_approvals SELECT policy'si sıradan
--   onaycının aynı talebin ÖNCEKİ adım satırlarını görmesine izin vermiyor →
--   view içinde düz alt sorgu onaycı için NULL döner. Fonksiyon RLS'i bypass
--   eder ama can_act_on_approval guard'ı ile yalnız çağıranın işlem
--   yapabildiği (kendi / vekaleten) satır için değer döndürür.
--
-- View'a yeni kolon (queued_at) SONA eklendi; mevcut kolonlar değişmedi
-- (CREATE OR REPLACE VIEW buna izin verir). security_invoker AÇIKÇA tekrar.
--
-- Önce DEV, sonra PROD. Kod (API order + tablo kolonu) bu SQL'e bağımlı:
-- ÖNCE SQL, SONRA deploy (tersi → /api/approvals/pending 500 verir).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.approval_queued_at(p_approval_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
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

-- Tanım sql/feature_approval_delegation_v1.sql 6a ile birebir aynı; tek fark
-- her iki dalın sonuna eklenen queued_at kolonu.
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
         ra.acted_by_employee_id,
         public.approval_queued_at(ra.id) AS queued_at
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
         ra.acted_by_employee_id,
         public.approval_queued_at(ra.id) AS queued_at
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

GRANT SELECT ON public.v_user_pending_approvals TO authenticated;

COMMIT;

-- ============================================================================
-- DOĞRULAMA (SELECT — uygulama sonrası çalıştır)
-- ============================================================================
-- 1) Nesneler yerinde mi?
-- SELECT
--   (SELECT prosecdef FROM pg_proc WHERE proname = 'approval_queued_at')                    AS fn_definer,     -- true
--   (SELECT reloptions FROM pg_class WHERE oid = 'public.v_user_pending_approvals'::regclass) AS view_opts,      -- {security_invoker=on}
--   EXISTS (SELECT 1 FROM information_schema.columns
--            WHERE table_name = 'v_user_pending_approvals' AND column_name = 'queued_at')    AS queued_col;     -- true
--
-- 2) SQL editor'de auth.uid() NULL olduğundan view 0 satır döner (beklenen).
--    Gerçek doğrulama uygulamadan: Bekleyen Onaylar sayfası açılmalı, toplam
--    sayı değişmemeli, "Onaya Geliş" kolonu dolu ve yukarıdan aşağı artan olmalı.
--
-- ============================================================================
-- GERİ ALMA (gerekirse — yorumu kaldırıp çalıştır; ÖNCE kodu geri al)
-- ============================================================================
-- CREATE OR REPLACE VIEW kolon DÜŞÜREMEZ → DROP + yeniden kur:
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_user_pending_approvals;
-- -- sql/feature_approval_delegation_v1.sql 6a'daki tanımı + GRANT'i çalıştır
-- DROP FUNCTION IF EXISTS public.approval_queued_at(uuid);
-- COMMIT;
-- ============================================================================
