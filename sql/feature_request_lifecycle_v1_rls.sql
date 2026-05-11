-- =====================================================================
-- Feature: Request Lifecycle (Update / Withdraw / Cancel / Revision)
-- Migration 3/3 — RLS policy güncellemeleri
-- =====================================================================
-- Önce Migration 1 (enums) ve Migration 2 (columns) çalıştırılmış olmalı.
-- DROP POLICY IF EXISTS + CREATE POLICY ile idempotent.
-- Helper fonksiyonlar: public.get_current_employee_id(), public.is_approver_for_request()
-- =====================================================================

-- =====================================================================
-- TİP A — "requester + DRAFT" mevcut policy'leri genişlet
-- (DRAFT → IN (DRAFT, REVISION_REQUESTED), ORG_ADMIN dalını ekle)
-- =====================================================================

-- expense_requests
DROP POLICY IF EXISTS "expense_requests_update" ON public.expense_requests;
CREATE POLICY "expense_requests_update" ON public.expense_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = expense_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- expense_items
DROP POLICY IF EXISTS "expense_items_update" ON public.expense_items;
CREATE POLICY "expense_items_update" ON public.expense_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_requests er
    JOIN public.requests r ON r.id = er.request_id
    WHERE er.id = expense_items.expense_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "expense_items_delete" ON public.expense_items;
CREATE POLICY "expense_items_delete" ON public.expense_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_requests er
    JOIN public.requests r ON r.id = er.request_id
    WHERE er.id = expense_items.expense_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- mukayese_requests
DROP POLICY IF EXISTS "mukayese_requests_update" ON public.mukayese_requests;
CREATE POLICY "mukayese_requests_update" ON public.mukayese_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = mukayese_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- mukayese_items
DROP POLICY IF EXISTS "mukayese_items_update" ON public.mukayese_items;
CREATE POLICY "mukayese_items_update" ON public.mukayese_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_requests mr
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mr.id = mukayese_items.mukayese_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "mukayese_items_delete" ON public.mukayese_items;
CREATE POLICY "mukayese_items_delete" ON public.mukayese_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_requests mr
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mr.id = mukayese_items.mukayese_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- mukayese_suppliers
DROP POLICY IF EXISTS "mukayese_suppliers_update" ON public.mukayese_suppliers;
CREATE POLICY "mukayese_suppliers_update" ON public.mukayese_suppliers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_requests mr
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mr.id = mukayese_suppliers.mukayese_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "mukayese_suppliers_delete" ON public.mukayese_suppliers;
CREATE POLICY "mukayese_suppliers_delete" ON public.mukayese_suppliers FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_requests mr
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mr.id = mukayese_suppliers.mukayese_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- mukayese_prices
DROP POLICY IF EXISTS "mukayese_prices_update" ON public.mukayese_prices;
CREATE POLICY "mukayese_prices_update" ON public.mukayese_prices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_items mi
    JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mi.id = mukayese_prices.mukayese_item_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "mukayese_prices_delete" ON public.mukayese_prices;
CREATE POLICY "mukayese_prices_delete" ON public.mukayese_prices FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.mukayese_items mi
    JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
    JOIN public.requests r ON r.id = mr.request_id
    WHERE mi.id = mukayese_prices.mukayese_item_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- accounting_approval_cover_requests
DROP POLICY IF EXISTS "accounting_approval_cover_requests_update" ON public.accounting_approval_cover_requests;
CREATE POLICY "accounting_approval_cover_requests_update" ON public.accounting_approval_cover_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = accounting_approval_cover_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- accounting_approval_cover_items
DROP POLICY IF EXISTS "accounting_approval_cover_items_update" ON public.accounting_approval_cover_items;
CREATE POLICY "accounting_approval_cover_items_update" ON public.accounting_approval_cover_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.accounting_approval_cover_requests acr
    JOIN public.requests r ON r.id = acr.request_id
    WHERE acr.id = accounting_approval_cover_items.accounting_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "accounting_approval_cover_items_delete" ON public.accounting_approval_cover_items;
CREATE POLICY "accounting_approval_cover_items_delete" ON public.accounting_approval_cover_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.accounting_approval_cover_requests acr
    JOIN public.requests r ON r.id = acr.request_id
    WHERE acr.id = accounting_approval_cover_items.accounting_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- finance_approval_cover_requests
DROP POLICY IF EXISTS "finance_approval_cover_requests_update" ON public.finance_approval_cover_requests;
CREATE POLICY "finance_approval_cover_requests_update" ON public.finance_approval_cover_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = finance_approval_cover_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- finance_approval_cover_items
DROP POLICY IF EXISTS "finance_approval_cover_items_update" ON public.finance_approval_cover_items;
CREATE POLICY "finance_approval_cover_items_update" ON public.finance_approval_cover_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.finance_approval_cover_requests fcr
    JOIN public.requests r ON r.id = fcr.request_id
    WHERE fcr.id = finance_approval_cover_items.finance_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "finance_approval_cover_items_delete" ON public.finance_approval_cover_items;
CREATE POLICY "finance_approval_cover_items_delete" ON public.finance_approval_cover_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.finance_approval_cover_requests fcr
    JOIN public.requests r ON r.id = fcr.request_id
    WHERE fcr.id = finance_approval_cover_items.finance_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- request_form_requests
DROP POLICY IF EXISTS "request_form_requests_update" ON public.request_form_requests;
CREATE POLICY "request_form_requests_update" ON public.request_form_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_form_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- =====================================================================
-- TİP B — leave_requests_update (FILL_AND_SIGN dalı korunur)
-- =====================================================================

DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = leave_requests.request_id
      AND (
        -- requester kendi talebini DRAFT veya REVISION_REQUESTED durumda düzenleyebilir
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        -- ORG_ADMIN her durumda
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
        -- Onaycı sırası geldiğinde FILL_AND_SIGN aksiyonu ile bölüm doldurabilir
        -- (mevcut davranış — KORUNUR)
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          JOIN public.workflow_steps ws ON ra.workflow_step_id = ws.id
          WHERE ra.request_id = r.id
            AND ra.approver_employee_id = public.get_current_employee_id()
            AND ra.status = 'PENDING'
            AND r.current_step = ws.step_order
            AND ws.action_type = 'FILL_AND_SIGN'
        )
      )
  )
);

-- =====================================================================
-- TİP C — Mevcut approver-only policy'ye ek olarak yeni requester policy
-- (Mevcut policy'ler dokunulmuyor; ek policy ile requester'a izin veriliyor)
-- =====================================================================

-- salary_advance_requests: mevcut "salary_advance_requests_update_approver" KORUNUR
DROP POLICY IF EXISTS "salary_advance_requests_update_requester" ON public.salary_advance_requests;
CREATE POLICY "salary_advance_requests_update_requester" ON public.salary_advance_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = salary_advance_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- travel_assignment_requests: mevcut "travel_assignment_requests_update_approver" KORUNUR
DROP POLICY IF EXISTS "travel_assignment_requests_update_requester" ON public.travel_assignment_requests;
CREATE POLICY "travel_assignment_requests_update_requester" ON public.travel_assignment_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = travel_assignment_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- =====================================================================
-- TİP D — separation_requests_update (mevcut policy status'suz ve geniş;
--          yeniden yazılır: requester + ORG_ADMIN + PENDING approver)
-- =====================================================================

DROP POLICY IF EXISTS "separation_requests_update" ON public.separation_requests;
CREATE POLICY "separation_requests_update" ON public.separation_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = separation_requests.request_id
      AND (
        -- requester DRAFT veya REVISION_REQUESTED'da düzenleyebilir
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        -- ORG_ADMIN her durumda
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
        -- Onaycı sırası geldiğinde checklist alanlarını doldurabilir (mevcut davranış korunur)
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          WHERE ra.request_id = r.id
            AND ra.approver_employee_id = public.get_current_employee_id()
            AND ra.status = 'PENDING'
        )
      )
  )
);

-- =====================================================================
-- TİP E — UPDATE policy hiç olmayan tablolar
-- =====================================================================

-- overtime_requests
DROP POLICY IF EXISTS "overtime_requests_update" ON public.overtime_requests;
CREATE POLICY "overtime_requests_update" ON public.overtime_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = overtime_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- overtime_entries
DROP POLICY IF EXISTS "overtime_entries_update" ON public.overtime_entries;
CREATE POLICY "overtime_entries_update" ON public.overtime_entries FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.overtime_requests orq
    JOIN public.requests r ON r.id = orq.request_id
    WHERE orq.id = overtime_entries.overtime_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

DROP POLICY IF EXISTS "overtime_entries_delete" ON public.overtime_entries;
CREATE POLICY "overtime_entries_delete" ON public.overtime_entries FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.overtime_requests orq
    JOIN public.requests r ON r.id = orq.request_id
    WHERE orq.id = overtime_entries.overtime_request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- approval_letter_requests
DROP POLICY IF EXISTS "approval_letter_requests_update" ON public.approval_letter_requests;
CREATE POLICY "approval_letter_requests_update" ON public.approval_letter_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = approval_letter_requests.request_id
      AND (
        (r.requester_employee_id = public.get_current_employee_id()
         AND r.status IN ('DRAFT','REVISION_REQUESTED'))
        OR EXISTS (
          SELECT 1 FROM public.app_users au
          WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
        )
      )
  )
);

-- =====================================================================
-- TİP F — request_approvals_update: REVISION_REQUESTED set'ine izin ver
-- (Onaycının kendi onay kaydını revize talebine çekebilmesi için)
-- =====================================================================

DROP POLICY IF EXISTS "request_approvals_update" ON public.request_approvals;
CREATE POLICY "request_approvals_update" ON public.request_approvals FOR UPDATE
USING (
  approver_employee_id = public.get_current_employee_id()
  AND status = 'PENDING'
)
WITH CHECK (
  approver_employee_id = public.get_current_employee_id()
  AND status IN ('APPROVED','REJECTED','REVISION_REQUESTED')
);
