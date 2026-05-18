-- =====================================================================
-- Feature: Approvals — Server-Side Pagination Views
-- =====================================================================
-- Onaylar sayfalarında ("Bekleyen Onaylar" ve "Onay Geçmişi") server-side
-- pagination + filter için iki view ekliyoruz.
--
-- Eskiden tüm onaylar tek query ile çekilip JS-side filter + dedup yapılıyordu.
-- Pagination doğru sayım için bu mantığın DB seviyesinde uygulanması gerek.
--
-- security_invoker = on:
--   View'lar RLS'i sorgulayan kullanıcının izniyle uygular. Yani
--   request_approvals'ın mevcut RLS policy'leri (approver_employee_id =
--   get_current_employee_id() vs.) yine geçerli; view ek bir güvenlik
--   delili gerektirmez.
--
-- User-scoped views:
--   Her iki view'da WHERE approver_employee_id = get_current_employee_id()
--   filter'ı bulunur. Bu hem doğruluk (history dedup'unun başka kullanıcıların
--   kayıtlarını da kapsamasını engeller) hem performans (RLS function
--   çağrıları + DISTINCT ON çok daha az satırda çalışır) için gerekli.
--
-- Filter kolonları:
--   workflow_definition_code view'larda exposed — PostgREST üzerinden
--   .eq('workflow_definition_code', code) ile filtre yapılabilir.
-- =====================================================================

-- View 1: Kullanıcının bekleyen onayları
-- Koşullar:
--   - bu kullanıcının onaycı olduğu kayıtlar
--   - approval.status = PENDING
--   - request.status aktif (PENDING veya AWAITING_COMPLETION) — terminal
--     statuslar (CANCELLED, APPROVED, REJECTED, COMPLETED, DRAFT) bekleyen
--     onaylarda görünmemeli, talep iptal/karara bağlanınca alttaki PENDING
--     approval kayıtları silinmediği için bu filtre şart.
--   - request.current_step = approval.sequence_order (sırası gelmiş)
--   - request.current_revision_cycle = approval.revision_cycle (aktif cycle)
DROP VIEW IF EXISTS public.v_user_pending_approvals;
CREATE VIEW public.v_user_pending_approvals
WITH (security_invoker = on) AS
SELECT
  ra.*,
  wd.code AS workflow_definition_code
FROM public.request_approvals ra
JOIN public.requests r ON r.id = ra.request_id
JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
WHERE ra.approver_employee_id = public.get_current_employee_id()
  AND ra.status = 'PENDING'::public.approval_status
  AND r.status IN ('PENDING'::public.request_status,
                   'AWAITING_COMPLETION'::public.request_status)
  AND r.current_step = ra.sequence_order
  AND COALESCE(r.current_revision_cycle, 0) = COALESCE(ra.revision_cycle, 0);

-- View 2: Kullanıcının onay geçmişi (dedup'lu)
-- Koşullar:
--   - bu kullanıcının onaycı olduğu kayıtlar
--   - status IN (APPROVED, REJECTED, REVISION_REQUESTED)
--   - workflow_step.approver_type != 'REQUESTER'
--     (REQUESTER tipi auto-APPROVED kayıtlar gerçek karar değil, talep
--      gönderme imzasıdır)
--   - DISTINCT ON (request_id, revision_cycle): aynı kullanıcının aynı talep
--     ve cycle için birden fazla SIGN_ONLY satırı olabilir (forward
--     auto-approve mantığı: gerçek karar verince ileri adımlardaki SIGN_ONLY
--     satırlar otomatik APPROVED'a çekilir). Bunlardan en küçük
--     sequence_order'lı kaydı tutuyoruz — fiilen tıklanan karar.
--
-- View user-scoped olduğu için DISTINCT ON'a approver eklemeye gerek yok;
-- dedup zaten sadece bu kullanıcının kayıtları üzerinde çalışır.
DROP VIEW IF EXISTS public.v_user_approval_history;
CREATE VIEW public.v_user_approval_history
WITH (security_invoker = on) AS
SELECT DISTINCT ON (ra.request_id, COALESCE(ra.revision_cycle, 0))
  ra.*,
  wd.code AS workflow_definition_code
FROM public.request_approvals ra
JOIN public.workflow_steps ws ON ws.id = ra.workflow_step_id
JOIN public.requests r ON r.id = ra.request_id
JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
WHERE ra.approver_employee_id = public.get_current_employee_id()
  AND ra.status IN (
        'APPROVED'::public.approval_status,
        'REJECTED'::public.approval_status,
        'REVISION_REQUESTED'::public.approval_status
      )
  AND ws.approver_type <> 'REQUESTER'
ORDER BY ra.request_id, COALESCE(ra.revision_cycle, 0), ra.sequence_order ASC;

-- =====================================================================
-- Index (performans için önemli — büyük tablolar)
-- =====================================================================
-- View'da WHERE approver_employee_id = ... AND status = ... filter'ı var.
-- Bu kompozit index ikisini birden destekler ve created_at sıralaması da
-- aynı index'ten karşılanır.
CREATE INDEX IF NOT EXISTS idx_request_approvals_approver_status_created
  ON public.request_approvals (approver_employee_id, status, created_at DESC);

-- =====================================================================
-- Notlar
-- =====================================================================
-- 1) PostgREST üzerinden view'lardan nested embed (request:..., workflow_step:...)
--    genelde otomatik çalışır çünkü view'da underlying tablo kolon adları
--    korunur. API tarafında iki adımlı bir strateji kullanılıyor:
--    a) View'dan sadece id'leri ve total count'u al (page'in id seti).
--    b) request_approvals tablosundan o id'lere ait minimal nested select'i
--       yap. Bu, view-üzerinden embed varsayımı yapmaktan daha güvenli ve
--       liste için gereken alanları temiz tutar.
--
-- 2) Drop sırası: View'ları drop etmek istersen:
--      DROP VIEW IF EXISTS public.v_user_pending_approvals;
--      DROP VIEW IF EXISTS public.v_user_approval_history;
