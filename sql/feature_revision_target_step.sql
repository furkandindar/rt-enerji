-- ============================================================================
-- Revize sorumlusu seçimi (2026-10-25)
-- ============================================================================
--
-- Geri bildirim: "Yönetici revize isterken belgeyi talep sahibine otomatik
-- göndermek yerine önceki onay adımlarından tek bir revize sorumlusu
-- seçebilmelidir." İşe Giriş / İşten Çıkış gibi uzun zincirlerde her revize
-- zinciri 1. adımdan yeniden başlatıyordu (ör. 2026-001663: GM 10. adımda
-- Hukuk + İdari İşler maddeleri için revize istedi, talep İK'ya döndü, zincir
-- baştan kuruldu).
--
-- Yeni davranış (kod: app/api/approvals/[id]/request-revision, lifecycle.ts):
--   - Revizeyi isteyen bir "revize sorumlusu" seçer: talep sahibi (varsayılan,
--     bugünkü akış) veya aktif turda kendisinden önce onay vermiş bir adım.
--   - Ara adım seçilirse talep REVISION_REQUESTED'a düşmez; hemen yeni tur
--     açılır: sorumludan önceki onaylar yeni tura TAŞINIR (APPROVED, orijinal
--     karar anı/imza), sorumlunun satırı PENDING olur.
--   - "Düzeltme sonrası" modu: RESTART_FROM_TARGET (sorumludan sonraki adımlar
--     yeniden onaylar) veya RETURN_TO_REVIEWER (aradaki onaylar da taşınır,
--     talep düzeltme sonrası doğrudan revizeyi isteyene döner).
--
-- Bu script:
--   1) request_approvals.carried_over_from_id — yeni tura taşınan onay satırı,
--      önceki turdaki asıl karar satırını gösterir. Süreç Logu / Onay Geçmişi
--      taşınan satırı ikinci bir karar gibi göstermesin diye.
--   2) request_approvals.revision_target_approval_id — REVISION_REQUESTED
--      satırında seçilen sorumlunun (aynı turdaki) onay satırı. NULL = talep
--      sahibi (eski kayıtlar dahil).
--   3) request_approvals.revision_return_mode — REVISION_REQUESTED satırında
--      düzeltme sonrası mod. NULL = RESTART_FROM_TARGET (eski kayıtlar dahil).
--   4) v_user_approval_history — taşınan satırlar hariç (yoksa aynı karar
--      onaycının geçmişinde her turda tekrar görünür). Tanım
--      sql/feature_approval_delegation_v1.sql 6b ile birebir aynı; tek fark
--      `ra.carried_over_from_id IS NULL` filtresi. security_invoker AÇIKÇA tekrar.
--
-- RLS: yeni kolonlar mevcut satır politikalarıyla korunur. Taşınan satırlar
-- service role ile yazılır (resetApprovalChain ile aynı gerekçe); onaycı kendi
-- satırına revize kararını (2, 3) mevcut UPDATE politikasıyla yazar.
--
-- Deploy sırası: ÖNCE bu SQL (DEV → PROD), SONRA kod deploy. Kod yeni
-- kolonları detay select'lerinde okuduğu için tersi sıra detay ekranlarını
-- 500'e düşürür. SQL tek başına davranış değiştirmez (kolonlar boş kalır).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1-3) Kolonlar
-- ----------------------------------------------------------------------------
ALTER TABLE public.request_approvals
  ADD COLUMN IF NOT EXISTS carried_over_from_id uuid
    REFERENCES public.request_approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_target_approval_id uuid
    REFERENCES public.request_approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_return_mode text;

ALTER TABLE public.request_approvals
  DROP CONSTRAINT IF EXISTS request_approvals_revision_return_mode_check;
ALTER TABLE public.request_approvals
  ADD CONSTRAINT request_approvals_revision_return_mode_check
  CHECK (revision_return_mode IS NULL
         OR revision_return_mode IN ('RESTART_FROM_TARGET', 'RETURN_TO_REVIEWER'));

COMMENT ON COLUMN public.request_approvals.carried_over_from_id IS
  'Revize sonrası yeni tura taşınan (yeniden onay gerektirmeyen) satırda, önceki '
  'turdaki asıl karar satırı. NULL = bu turda verilmiş gerçek karar / bekleyen satır.';
COMMENT ON COLUMN public.request_approvals.revision_target_approval_id IS
  'REVISION_REQUESTED satırında: revizeyi düzeltecek sorumlunun aynı turdaki onay '
  'satırı. NULL = talep sahibi (formu düzenleyip yeniden gönderir).';
COMMENT ON COLUMN public.request_approvals.revision_return_mode IS
  'REVISION_REQUESTED satırında düzeltme sonrası akış: RESTART_FROM_TARGET (sorumludan '
  'sonraki adımlar yeniden onaylar) | RETURN_TO_REVIEWER (doğrudan revizeyi isteyene '
  'döner). NULL = RESTART_FROM_TARGET.';

-- ----------------------------------------------------------------------------
-- 4) Onay geçmişi: taşınan satırlar hariç
-- ----------------------------------------------------------------------------
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
     AND ra.carried_over_from_id IS NULL
     AND (
       (ra.approver_employee_id = public.get_current_employee_id() AND ws.approver_type <> 'REQUESTER')
       OR ra.acted_by_employee_id = public.get_current_employee_id()
     )
   ORDER BY ra.request_id, COALESCE(ra.revision_cycle::integer, 0), ra.sequence_order;

GRANT SELECT ON public.v_user_approval_history TO authenticated;

COMMIT;

-- ============================================================================
-- DOĞRULAMA (SELECT — uygulama sonrası çalıştır)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'request_approvals'
--    AND column_name IN ('carried_over_from_id', 'revision_target_approval_id', 'revision_return_mode');
--   -- 3 satır, hepsi YES
--
-- SELECT reloptions FROM pg_class WHERE oid = 'public.v_user_approval_history'::regclass;
--   -- {security_invoker=on}
--
-- SELECT pg_get_viewdef('public.v_user_approval_history'::regclass, true) LIKE '%carried_over_from_id IS NULL%';
--   -- true
--
-- Uygulamadan: Onay Geçmişi sayfası açılmalı, toplam sayı değişmemeli
-- (kolonlar henüz boş olduğundan filtre hiçbir satırı elemez).
--
-- ============================================================================
-- GERİ ALMA (gerekirse — ÖNCE kodu geri al, sonra yorumu kaldırıp çalıştır)
-- ============================================================================
-- BEGIN;
-- -- sql/feature_approval_delegation_v1.sql 6b'deki view tanımını + GRANT'i çalıştır
-- ALTER TABLE public.request_approvals
--   DROP CONSTRAINT IF EXISTS request_approvals_revision_return_mode_check,
--   DROP COLUMN IF EXISTS revision_return_mode,
--   DROP COLUMN IF EXISTS revision_target_approval_id,
--   DROP COLUMN IF EXISTS carried_over_from_id;
-- COMMIT;
-- ============================================================================
