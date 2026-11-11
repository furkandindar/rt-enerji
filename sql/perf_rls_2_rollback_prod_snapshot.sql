-- ============================================================================
-- ACİL DURUM GERİ ALMA: perf_rls_2_policies.sql öncesi PROD politika tanımları
-- Anlık görüntü: 2026-11-11, prod, public şeması, 139 politika (pg_policies).
-- Yalnız perf_rls_2_policies.sql prod'da beklenmedik davranış gösterirse uygulanır;
-- politikaları birebir eski metne döndürür. perf_rls_1 fonksiyonları zararsızdır, kalabilir.
-- ============================================================================

BEGIN;
SET LOCAL search_path = public, extensions;

ALTER POLICY "accounting_approval_cover_items_delete" ON public."accounting_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (accounting_approval_cover_requests acr
     JOIN requests r ON ((r.id = acr.request_id)))
  WHERE ((acr.id = accounting_approval_cover_items.accounting_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "accounting_approval_cover_items_insert" ON public."accounting_approval_cover_items" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((accounting_approval_cover_requests acr
     JOIN requests r ON ((r.id = acr.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((acr.id = accounting_approval_cover_items.accounting_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "accounting_approval_cover_items_select" ON public."accounting_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (accounting_approval_cover_requests ar
     JOIN requests r ON ((r.id = ar.request_id)))
  WHERE ((ar.id = accounting_approval_cover_items.accounting_request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "accounting_approval_cover_items_update" ON public."accounting_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (accounting_approval_cover_requests acr
     JOIN requests r ON ((r.id = acr.request_id)))
  WHERE ((acr.id = accounting_approval_cover_items.accounting_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "accounting_approval_cover_requests_insert" ON public."accounting_approval_cover_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = accounting_approval_cover_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "accounting_approval_cover_requests_select" ON public."accounting_approval_cover_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = accounting_approval_cover_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "accounting_approval_cover_requests_update" ON public."accounting_approval_cover_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = accounting_approval_cover_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "app_users_select_all" ON public."app_users" USING (true);
ALTER POLICY "app_users_update_privacy_self" ON public."app_users" USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
ALTER POLICY "approval_delegations_insert" ON public."approval_delegations" WITH CHECK (((created_by_user_id = auth.uid()) AND ((delegator_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))));
ALTER POLICY "approval_delegations_select" ON public."approval_delegations" USING (((delegator_employee_id = get_current_employee_id()) OR (delegate_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))));
ALTER POLICY "approval_delegations_update" ON public."approval_delegations" USING (((delegator_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))) WITH CHECK (((delegator_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))));
ALTER POLICY "approval_letter_requests_insert" ON public."approval_letter_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = approval_letter_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "approval_letter_requests_select" ON public."approval_letter_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = approval_letter_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))))))));
ALTER POLICY "approval_letter_requests_update" ON public."approval_letter_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = approval_letter_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "companies_insert_admin" ON public."companies" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "companies_select_auth" ON public."companies" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "companies_update_admin" ON public."companies" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employee_positions_delete_admin" ON public."employee_positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employee_positions_insert_admin" ON public."employee_positions" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employee_positions_select_auth" ON public."employee_positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "employee_positions_update_admin" ON public."employee_positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employees_delete_admin" ON public."employees" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employees_insert_admin" ON public."employees" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employees_select_auth" ON public."employees" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "employees_update_admin" ON public."employees" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "employees_update_own_signature" ON public."employees" USING ((id = ( SELECT app_users.employee_id
   FROM app_users
  WHERE (app_users.id = auth.uid())))) WITH CHECK ((id = ( SELECT app_users.employee_id
   FROM app_users
  WHERE (app_users.id = auth.uid()))));
ALTER POLICY "expense_items_delete" ON public."expense_items" USING ((EXISTS ( SELECT 1
   FROM (expense_requests er
     JOIN requests r ON ((r.id = er.request_id)))
  WHERE ((er.id = expense_items.expense_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "expense_items_insert" ON public."expense_items" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((expense_requests er
     JOIN requests r ON ((r.id = er.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((er.id = expense_items.expense_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "expense_items_select" ON public."expense_items" USING ((EXISTS ( SELECT 1
   FROM (expense_requests er
     JOIN requests r ON ((r.id = er.request_id)))
  WHERE ((er.id = expense_items.expense_request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "expense_items_update" ON public."expense_items" USING ((EXISTS ( SELECT 1
   FROM (expense_requests er
     JOIN requests r ON ((r.id = er.request_id)))
  WHERE ((er.id = expense_items.expense_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "expense_requests_insert" ON public."expense_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = expense_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "expense_requests_select" ON public."expense_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = expense_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "expense_requests_update" ON public."expense_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = expense_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "finance_approval_cover_items_delete" ON public."finance_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (finance_approval_cover_requests fcr
     JOIN requests r ON ((r.id = fcr.request_id)))
  WHERE ((fcr.id = finance_approval_cover_items.finance_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "finance_approval_cover_items_insert" ON public."finance_approval_cover_items" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((finance_approval_cover_requests fcr
     JOIN requests r ON ((r.id = fcr.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((fcr.id = finance_approval_cover_items.finance_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "finance_approval_cover_items_select" ON public."finance_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (finance_approval_cover_requests fr
     JOIN requests r ON ((r.id = fr.request_id)))
  WHERE ((fr.id = finance_approval_cover_items.finance_request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "finance_approval_cover_items_update" ON public."finance_approval_cover_items" USING ((EXISTS ( SELECT 1
   FROM (finance_approval_cover_requests fcr
     JOIN requests r ON ((r.id = fcr.request_id)))
  WHERE ((fcr.id = finance_approval_cover_items.finance_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "finance_approval_cover_requests_insert" ON public."finance_approval_cover_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = finance_approval_cover_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "finance_approval_cover_requests_select" ON public."finance_approval_cover_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = finance_approval_cover_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "finance_approval_cover_requests_update" ON public."finance_approval_cover_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = finance_approval_cover_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "grade_levels_delete_admin" ON public."grade_levels" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "grade_levels_insert_admin" ON public."grade_levels" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "grade_levels_select_auth" ON public."grade_levels" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "grade_levels_update_admin" ON public."grade_levels" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "leave_requests_insert" ON public."leave_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = leave_requests.request_id) AND (r.requester_employee_id = get_current_employee_id())))));
ALTER POLICY "leave_requests_select" ON public."leave_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = leave_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id = get_current_employee_id())))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "leave_requests_update" ON public."leave_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = leave_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))) OR (EXISTS ( SELECT 1
           FROM (request_approvals ra
             JOIN workflow_steps ws ON ((ra.workflow_step_id = ws.id)))
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id = get_current_employee_id()) AND (ra.status = 'PENDING'::approval_status) AND (r.current_step = ws.step_order) AND (ws.action_type = 'FILL_AND_SIGN'::text)))))))));
ALTER POLICY "mukayese_items_delete" ON public."mukayese_items" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_items.mukayese_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_items_insert" ON public."mukayese_items" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((mr.id = mukayese_items.mukayese_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "mukayese_items_select" ON public."mukayese_items" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_items.mukayese_request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_items_update" ON public."mukayese_items" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_items.mukayese_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_prices_delete" ON public."mukayese_prices" USING ((EXISTS ( SELECT 1
   FROM ((mukayese_items mi
     JOIN mukayese_requests mr ON ((mr.id = mi.mukayese_request_id)))
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mi.id = mukayese_prices.mukayese_item_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_prices_insert" ON public."mukayese_prices" WITH CHECK ((EXISTS ( SELECT 1
   FROM (((mukayese_items mi
     JOIN mukayese_requests mr ON ((mr.id = mi.mukayese_request_id)))
     JOIN requests r ON ((r.id = mr.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((mi.id = mukayese_prices.mukayese_item_id) AND (au.id = auth.uid())))));
ALTER POLICY "mukayese_prices_select" ON public."mukayese_prices" USING ((EXISTS ( SELECT 1
   FROM ((mukayese_items mi
     JOIN mukayese_requests mr ON ((mr.id = mi.mukayese_request_id)))
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mi.id = mukayese_prices.mukayese_item_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_prices_update" ON public."mukayese_prices" USING ((EXISTS ( SELECT 1
   FROM ((mukayese_items mi
     JOIN mukayese_requests mr ON ((mr.id = mi.mukayese_request_id)))
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mi.id = mukayese_prices.mukayese_item_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_requests_insert" ON public."mukayese_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = mukayese_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "mukayese_requests_select" ON public."mukayese_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = mukayese_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_requests_update" ON public."mukayese_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = mukayese_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_suppliers_delete" ON public."mukayese_suppliers" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_suppliers.mukayese_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_suppliers_insert" ON public."mukayese_suppliers" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((mr.id = mukayese_suppliers.mukayese_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "mukayese_suppliers_select" ON public."mukayese_suppliers" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_suppliers.mukayese_request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "mukayese_suppliers_update" ON public."mukayese_suppliers" USING ((EXISTS ( SELECT 1
   FROM (mukayese_requests mr
     JOIN requests r ON ((r.id = mr.request_id)))
  WHERE ((mr.id = mukayese_suppliers.mukayese_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "notifications_insert_anon" ON public."notifications" WITH CHECK (true);
ALTER POLICY "notifications_insert_any" ON public."notifications" WITH CHECK (true);
ALTER POLICY "notifications_select" ON public."notifications" USING ((user_id = auth.uid()));
ALTER POLICY "notifications_update" ON public."notifications" USING ((user_id = auth.uid()));
ALTER POLICY "onboarding_approval_requests_insert" ON public."onboarding_approval_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = onboarding_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id())))));
ALTER POLICY "onboarding_approval_requests_select" ON public."onboarding_approval_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE (r.id = onboarding_approval_requests.request_id))));
ALTER POLICY "onboarding_approval_requests_update" ON public."onboarding_approval_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = onboarding_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = onboarding_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))))));
ALTER POLICY "onboarding_requests_insert" ON public."onboarding_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = onboarding_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "onboarding_requests_select" ON public."onboarding_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = onboarding_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "onboarding_requests_update" ON public."onboarding_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = onboarding_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid()))) AND (ra.status = 'PENDING'::approval_status)))))))));
ALTER POLICY "organizational_units_delete_admin" ON public."organizational_units" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "organizational_units_insert_admin" ON public."organizational_units" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "organizational_units_select_auth" ON public."organizational_units" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "organizational_units_update_admin" ON public."organizational_units" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "overtime_entries_delete" ON public."overtime_entries" USING ((EXISTS ( SELECT 1
   FROM (overtime_requests orq
     JOIN requests r ON ((r.id = orq.request_id)))
  WHERE ((orq.id = overtime_entries.overtime_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "overtime_entries_insert" ON public."overtime_entries" WITH CHECK ((EXISTS ( SELECT 1
   FROM ((overtime_requests orq
     JOIN requests r ON ((r.id = orq.request_id)))
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((orq.id = overtime_entries.overtime_request_id) AND (au.id = auth.uid())))));
ALTER POLICY "overtime_entries_select" ON public."overtime_entries" USING ((EXISTS ( SELECT 1
   FROM (overtime_requests ot
     JOIN requests r ON ((r.id = ot.request_id)))
  WHERE ((ot.id = overtime_entries.overtime_request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "overtime_entries_update" ON public."overtime_entries" USING ((EXISTS ( SELECT 1
   FROM (overtime_requests orq
     JOIN requests r ON ((r.id = orq.request_id)))
  WHERE ((orq.id = overtime_entries.overtime_request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "overtime_requests_insert" ON public."overtime_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = overtime_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "overtime_requests_select" ON public."overtime_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = overtime_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "overtime_requests_update" ON public."overtime_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = overtime_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "position_types_delete_admin" ON public."position_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "position_types_insert_admin" ON public."position_types" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "position_types_select_auth" ON public."position_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "position_types_update_admin" ON public."position_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "positions_delete_admin" ON public."positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "positions_insert_admin" ON public."positions" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "positions_select_auth" ON public."positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "positions_update_admin" ON public."positions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "request_approvals_insert" ON public."request_approvals" WITH CHECK (((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_approvals.request_id) AND (r.requester_employee_id = get_current_employee_id()))))));
ALTER POLICY "request_approvals_select" ON public."request_approvals" USING (((approver_employee_id = get_current_employee_id()) OR (acted_by_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_approvals.request_id) AND (r.requester_employee_id = get_current_employee_id())))) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_approvals.request_id) AND can_view_workflow_requests(r.workflow_definition_id)))) OR ((EXISTS ( SELECT 1
   FROM approval_delegations d
  WHERE ((d.delegate_employee_id = get_current_employee_id()) AND (d.status = 'ACTIVE'::text) AND (now() >= d.starts_at) AND (now() < d.ends_at)))) AND can_act_on_approval(id))));
ALTER POLICY "request_approvals_update" ON public."request_approvals" USING (((status = 'PENDING'::approval_status) AND can_act_on_approval(id))) WITH CHECK (((status = ANY (ARRAY['APPROVED'::approval_status, 'REJECTED'::approval_status, 'REVISION_REQUESTED'::approval_status])) AND (approver_employee_id = approval_stored_approver(id)) AND (((acted_by_employee_id IS NULL) AND (approver_employee_id = get_current_employee_id())) OR (acted_by_employee_id = get_current_employee_id()))));
ALTER POLICY "ra_delete" ON public."request_attachments" USING ((uploaded_by IN ( SELECT app_users.employee_id
   FROM app_users
  WHERE (app_users.id = auth.uid()))));
ALTER POLICY "ra_insert" ON public."request_attachments" WITH CHECK ((uploaded_by IN ( SELECT app_users.employee_id
   FROM app_users
  WHERE (app_users.id = auth.uid()))));
ALTER POLICY "ra_select" ON public."request_attachments" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_attachments.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id = get_current_employee_id())))) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "request_extra_approvers_select" ON public."request_extra_approvers" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE (r.id = request_extra_approvers.request_id))));
ALTER POLICY "request_form_requests_insert" ON public."request_form_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = request_form_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "request_form_requests_select" ON public."request_form_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_form_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))))))));
ALTER POLICY "request_form_requests_update" ON public."request_form_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = request_form_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "request_mentions_select" ON public."request_mentions" USING (((mentioned_employee_id = get_current_employee_id()) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE (r.id = request_mentions.request_id)))));
ALTER POLICY "requests_insert" ON public."requests" WITH CHECK ((requester_employee_id = get_current_employee_id()));
ALTER POLICY "requests_select" ON public."requests" USING (((requester_employee_id = get_current_employee_id()) OR is_approver_for_request(id) OR (EXISTS ( SELECT 1
   FROM app_users
  WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(workflow_definition_id)));
ALTER POLICY "requests_update" ON public."requests" USING (((requester_employee_id = get_current_employee_id()) OR is_approver_for_request(id) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))));
ALTER POLICY "salary_advance_requests_insert" ON public."salary_advance_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = salary_advance_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "salary_advance_requests_select" ON public."salary_advance_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = salary_advance_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))))))));
ALTER POLICY "salary_advance_requests_update_approver" ON public."salary_advance_requests" USING ((EXISTS ( SELECT 1
   FROM ((request_approvals ra
     JOIN app_users au ON ((au.employee_id = ra.approver_employee_id)))
     JOIN requests r ON ((r.id = ra.request_id)))
  WHERE ((r.id = salary_advance_requests.request_id) AND (au.id = auth.uid()) AND (ra.status = 'PENDING'::approval_status))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((request_approvals ra
     JOIN app_users au ON ((au.employee_id = ra.approver_employee_id)))
     JOIN requests r ON ((r.id = ra.request_id)))
  WHERE ((r.id = salary_advance_requests.request_id) AND (au.id = auth.uid()) AND (ra.status = 'PENDING'::approval_status)))));
ALTER POLICY "salary_advance_requests_update_requester" ON public."salary_advance_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = salary_advance_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "separation_approval_requests_insert" ON public."separation_approval_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = separation_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id())))));
ALTER POLICY "separation_approval_requests_select" ON public."separation_approval_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE (r.id = separation_approval_requests.request_id))));
ALTER POLICY "separation_approval_requests_update" ON public."separation_approval_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = separation_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = separation_approval_requests.request_id) AND (r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))))));
ALTER POLICY "separation_requests_insert" ON public."separation_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = separation_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "separation_requests_select" ON public."separation_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = separation_requests.request_id) AND ((r.requester_employee_id = get_current_employee_id()) OR is_approver_for_request(r.id) OR (EXISTS ( SELECT 1
           FROM app_users
          WHERE ((app_users.id = auth.uid()) AND (app_users.role = 'ORG_ADMIN'::text)))) OR can_view_workflow_requests(r.workflow_definition_id))))));
ALTER POLICY "separation_requests_update" ON public."separation_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = separation_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id = get_current_employee_id()) AND (ra.status = 'PENDING'::approval_status)))))))));
ALTER POLICY "stamp_requests_insert" ON public."stamp_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = stamp_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "stamp_requests_select" ON public."stamp_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = stamp_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))))))));
ALTER POLICY "stamp_requests_update" ON public."stamp_requests" USING (((EXISTS ( SELECT 1
   FROM ((request_approvals ra
     JOIN app_users au ON ((au.employee_id = ra.approver_employee_id)))
     JOIN requests r ON ((r.id = ra.request_id)))
  WHERE ((r.id = stamp_requests.request_id) AND (au.id = auth.uid()) AND (ra.status = 'PENDING'::approval_status)))) OR (EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))));
ALTER POLICY "stamps_insert_admin" ON public."stamps" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "stamps_select" ON public."stamps" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE (au.id = auth.uid()))));
ALTER POLICY "stamps_update_admin" ON public."stamps" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "travel_assignment_requests_insert" ON public."travel_assignment_requests" WITH CHECK ((EXISTS ( SELECT 1
   FROM (requests r
     JOIN app_users au ON ((au.employee_id = r.requester_employee_id)))
  WHERE ((r.id = travel_assignment_requests.request_id) AND (au.id = auth.uid())))));
ALTER POLICY "travel_assignment_requests_select" ON public."travel_assignment_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = travel_assignment_requests.request_id) AND ((r.requester_employee_id IN ( SELECT app_users.employee_id
           FROM app_users
          WHERE (app_users.id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM request_approvals ra
          WHERE ((ra.request_id = r.id) AND (ra.approver_employee_id IN ( SELECT app_users.employee_id
                   FROM app_users
                  WHERE (app_users.id = auth.uid())))))))))));
ALTER POLICY "travel_assignment_requests_update_approver" ON public."travel_assignment_requests" USING ((EXISTS ( SELECT 1
   FROM ((request_approvals ra
     JOIN app_users au ON ((au.employee_id = ra.approver_employee_id)))
     JOIN requests r ON ((r.id = ra.request_id)))
  WHERE ((r.id = travel_assignment_requests.request_id) AND (au.id = auth.uid()) AND (ra.status = 'PENDING'::approval_status))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((request_approvals ra
     JOIN app_users au ON ((au.employee_id = ra.approver_employee_id)))
     JOIN requests r ON ((r.id = ra.request_id)))
  WHERE ((r.id = travel_assignment_requests.request_id) AND (au.id = auth.uid()) AND (ra.status = 'PENDING'::approval_status)))));
ALTER POLICY "travel_assignment_requests_update_requester" ON public."travel_assignment_requests" USING ((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = travel_assignment_requests.request_id) AND (((r.requester_employee_id = get_current_employee_id()) AND (r.status = ANY (ARRAY['DRAFT'::request_status, 'REVISION_REQUESTED'::request_status]))) OR (EXISTS ( SELECT 1
           FROM app_users au
          WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))))))));
ALTER POLICY "unit_types_delete_admin" ON public."unit_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "unit_types_insert_admin" ON public."unit_types" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "unit_types_select_auth" ON public."unit_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = ANY (ARRAY['ORG_ADMIN'::text, 'ORG_VIEWER'::text]))))));
ALTER POLICY "unit_types_update_admin" ON public."unit_types" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "workflow_definitions_insert_admin" ON public."workflow_definitions" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "workflow_definitions_select" ON public."workflow_definitions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE (au.id = auth.uid()))));
ALTER POLICY "workflow_definitions_update_admin" ON public."workflow_definitions" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "workflow_initiators_select_all" ON public."workflow_initiators" USING (true);
ALTER POLICY "wsa_select" ON public."workflow_step_attachments" USING (true);
ALTER POLICY "workflow_step_changes_select_admin" ON public."workflow_step_changes" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "workflow_steps_insert_admin" ON public."workflow_steps" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));
ALTER POLICY "workflow_steps_select" ON public."workflow_steps" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE (au.id = auth.uid()))));
ALTER POLICY "workflow_steps_update_admin" ON public."workflow_steps" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.id = auth.uid()) AND (au.role = 'ORG_ADMIN'::text)))));

COMMIT;
