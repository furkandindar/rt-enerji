-- Fix: v_user_pending_approvals — terminal taleplerin bekleyen onay kuyruğunda
-- görünmesini engelle.
--
-- Sorun: View yalnızca approval satırının PENDING'liğine ve current_step
-- eşleşmesine bakıyordu; talebin (requests.status) iptal/red/tamamlanmış olup
-- olmadığına BAKMIYORDU. Cancel route request_approvals'a dokunmadığı için,
-- iptal edilmiş (CANCELLED) bir talebin bekleyen completion-adımı satırı
-- onaycının kuyruğunda kalmaya devam ediyor → onaycı onu "reddedip" final
-- statüyü CANCELLED → REJECTED'a ezebiliyordu (bkz. talep 2026-000049).
--
-- Çözüm: Yalnızca canlı akıştaki (PENDING / AWAITING_COMPLETION) talepleri göster.
-- Sunucu tarafı asıl guard PATCH /api/approvals/[id] içinde (ACTIONABLE_REQUEST_STATUSES);
-- bu view filtresi belt-and-suspenders + UX: terminal talep kuyruktan anında düşer.
--
-- ÖNEMLİ: View prod'da `security_invoker = on` ile tanımlı (RLS sorgulayan
-- kullanıcının yetkisiyle uygulanır). CREATE OR REPLACE bu opsiyonu sıfırlama
-- riski taşıdığı için WITH (security_invoker = on) AÇIKÇA tekrar ediliyor —
-- yoksa view sahip (postgres) yetkisiyle çalışıp RLS'i bypass ederdi.

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
         wd.code AS workflow_definition_code
    FROM request_approvals ra
    JOIN requests r ON r.id = ra.request_id
    JOIN workflow_definitions wd ON wd.id = r.workflow_definition_id
   WHERE ra.approver_employee_id = get_current_employee_id()
     AND ra.status = 'PENDING'::approval_status
     AND r.current_step = ra.sequence_order
     AND COALESCE(r.current_revision_cycle::integer, 0) = COALESCE(ra.revision_cycle::integer, 0)
     AND r.status IN ('PENDING', 'AWAITING_COMPLETION');  -- YENİ: terminal talepleri gizle
