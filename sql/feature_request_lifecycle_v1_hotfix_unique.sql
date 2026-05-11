-- =====================================================================
-- Feature: Request Lifecycle V5 — HOTFIX
-- request_approvals UNIQUE constraint'i revision_cycle ile genişlet
-- =====================================================================
-- SORUN: Canlı şemada şu constraint var:
--   UNIQUE (request_id, workflow_step_id, approver_employee_id)
-- Bu constraint V3'te DYNAMIC_USER_LIST için eklenmişti — aynı kişi aynı
-- adımda iki kez insert edilmesin diye. Ancak V5'te resubmit yeni revision
-- cycle insert edince aynı kişi aynı adımda farklı cycle ile çakışıyor.
--
-- ÇÖZÜM: Constraint'i revision_cycle ile genişlet. Eski cycle audit için
-- duruyor, yeni cycle insert edilebilmeli.
-- =====================================================================

DO $$
BEGIN
  -- Eski constraint'i kaldır (varsa)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_approvals_request_step_approver_key'
  ) THEN
    ALTER TABLE public.request_approvals
      DROP CONSTRAINT request_approvals_request_step_approver_key;
  END IF;

  -- Yeni constraint'i ekle (cycle dahil; yoksa)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_approvals_request_step_approver_cycle_key'
  ) THEN
    ALTER TABLE public.request_approvals
      ADD CONSTRAINT request_approvals_request_step_approver_cycle_key
      UNIQUE (request_id, workflow_step_id, approver_employee_id, revision_cycle);
  END IF;
END $$;
