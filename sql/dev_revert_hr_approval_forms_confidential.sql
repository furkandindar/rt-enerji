-- ============================================================================
-- YALNIZ DEV: "gizli süreç" (workflow_definitions.is_confidential) geri alınır
-- ============================================================================
--
-- 2026-11-07'de dev'e uygulanan iki script geri alındı ve arşivden çıkarıldı:
--   - feature_hr_approval_forms_1_confidential.sql (is_confidential kolonu + CHECK,
--     can_view_workflow_requests / requests_select / request_approvals_select /
--     ra_select / employees_who_can_view_request'te ORG_ADMIN'i gizli süreçten dışlama)
--   - fix_delegations_block_confidential.sql (vekalet insert/update'te gizli süreç yasağı)
--
-- Sebep (kullanıcı kararı, 2026-11-09): İşe Giriş / İşten Çıkış Onay formlarını
-- ORG_ADMIN de görmeli; formlar diğer kısıtlı İK süreçleri gibi çalışır (İK birimi +
-- ORG_ADMIN + talep sahibi + onay zinciri). Bu iki script PROD'a HİÇ uygulanmadı.
--
-- Aşağıdaki tanımlar PROD'dan (2026-11-09) birebir alındı → dev yeniden prod ile aynı.
-- PROD'A UYGULANMAZ (prod zaten bu halde).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_workflow_requests(p_workflow_definition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE id = auth.uid() AND role = 'ORG_ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM workflow_definitions
    WHERE id = p_workflow_definition_id
      AND is_restricted = false
  )
  OR EXISTS (
    SELECT 1
    FROM workflow_initiators wi
    JOIN employee_positions ep
      ON ep.employee_id = public.get_current_employee_id()
     AND ep.end_date IS NULL
    JOIN positions p ON p.id = ep.position_id
    WHERE wi.workflow_definition_id = p_workflow_definition_id
      AND (
        (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
        OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
      )
  );
$function$;

ALTER POLICY requests_select ON public.requests
  USING (
    (requester_employee_id = get_current_employee_id())
    OR is_approver_for_request(id)
    OR (EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid() AND app_users.role = 'ORG_ADMIN'::text
    ))
    OR can_view_workflow_requests(workflow_definition_id)
  );

ALTER POLICY request_approvals_select ON public.request_approvals
  USING (
    (approver_employee_id = get_current_employee_id())
    OR (acted_by_employee_id = get_current_employee_id())
    OR (EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_approvals.request_id
        AND r.requester_employee_id = get_current_employee_id()
    ))
    OR (EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'::text
    ))
    OR (EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_approvals.request_id
        AND can_view_workflow_requests(r.workflow_definition_id)
    ))
    OR (
      (EXISTS (
        SELECT 1 FROM approval_delegations d
        WHERE d.delegate_employee_id = get_current_employee_id()
          AND d.status = 'ACTIVE'::text
          AND now() >= d.starts_at
          AND now() < d.ends_at
      ))
      AND can_act_on_approval(id)
    )
  );

ALTER POLICY ra_select ON public.request_attachments
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_attachments.request_id
        AND (
          (r.requester_employee_id = get_current_employee_id())
          OR (EXISTS (
            SELECT 1 FROM request_approvals ra
            WHERE ra.request_id = r.id
              AND ra.approver_employee_id = get_current_employee_id()
          ))
          OR (EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.id = auth.uid() AND app_users.role = 'ORG_ADMIN'::text
          ))
          OR can_view_workflow_requests(r.workflow_definition_id)
        )
    )
  );

ALTER POLICY approval_delegations_insert ON public.approval_delegations
  WITH CHECK (
    (created_by_user_id = auth.uid())
    AND (
      (delegator_employee_id = get_current_employee_id())
      OR (EXISTS (
        SELECT 1 FROM app_users au
        WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'::text
      ))
    )
  );

ALTER POLICY approval_delegations_update ON public.approval_delegations
  WITH CHECK (
    (delegator_employee_id = get_current_employee_id())
    OR (EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'::text
    ))
  );

CREATE OR REPLACE FUNCTION public.employees_who_can_view_request(p_request_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(employee_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.employees_who_can_view_request(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employees_who_can_view_request(uuid, uuid[]) TO service_role;

ALTER TABLE public.workflow_definitions
  DROP CONSTRAINT IF EXISTS workflow_definitions_confidential_requires_restricted;
ALTER TABLE public.workflow_definitions
  DROP COLUMN IF EXISTS is_confidential;

COMMIT;
