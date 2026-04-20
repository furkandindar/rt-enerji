-- ============================================================================
-- MIGRATION: request_approvals unique constraint'ini DYNAMIC_USER_LIST destekli hale getir
-- ============================================================================
-- Sorun:
--   Mevcut UNIQUE (request_id, workflow_step_id) constraint'i, bir step'e
--   birden fazla onaycı atanmasını engelliyor. DYNAMIC_USER_LIST step tipinde
--   aynı step için N adet "İlgili" satırı oluşturulması gerektiği için bu
--   constraint "duplicate key value violates unique constraint" hatasına neden
--   oluyor.
--
-- Çözüm:
--   Eski unique constraint'i düşür, yerine (request_id, workflow_step_id,
--   approver_employee_id) kombinasyonlu yeni bir unique ekle. Bu,
--   DYNAMIC_USER_LIST'e farklı onaycılarla birden fazla satır eklemeye izin
--   verirken aynı onaycının aynı step'te iki kez kaydedilmesini engeller.
-- ============================================================================

alter table public.request_approvals
  drop constraint if exists request_approvals_request_id_workflow_step_id_key;

alter table public.request_approvals
  add constraint request_approvals_request_step_approver_key
  unique (request_id, workflow_step_id, approver_employee_id);
