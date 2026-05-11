-- =====================================================================
-- Feature: Request Lifecycle (Update / Withdraw / Cancel / Revision)
-- Migration 2/3 — Kolon + index + audit alanları
-- =====================================================================
-- Önce Migration 1 (enums) çalıştırılmış olmalıdır.
-- Yeni kolonların hepsi DEFAULT değerlerle gelir → mevcut DRAFT/PENDING
-- talepler etkilenmez, eski sorgular revision_cycle=0 üzerinden çalışır.
-- =====================================================================

-- Revision cycle desteği: her revize sıfırlamasında cycle artırılır,
-- eski cycle'ın approval kayıtları audit için olduğu yerde kalır.
ALTER TABLE public.request_approvals
  ADD COLUMN IF NOT EXISTS revision_cycle smallint NOT NULL DEFAULT 0;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS current_revision_cycle smallint NOT NULL DEFAULT 0;

-- Aktif cycle'ı filtrelemeye yarayan composite index
CREATE INDEX IF NOT EXISTS idx_request_approvals_req_cycle
  ON public.request_approvals (request_id, revision_cycle, sequence_order);

-- Audit alanları: son lifecycle aksiyonunu kaydet
-- (WITHDRAWN, RESUBMITTED, REVISION_REQUESTED, CANCELLED, EDITED, EDITED_BY_ADMIN)
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS last_action text,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_action_by uuid REFERENCES public.employees(id);
