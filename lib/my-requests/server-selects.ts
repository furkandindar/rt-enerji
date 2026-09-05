// Talep endpoint'leri için Supabase select string'leri ve workflow code →
// tipe özel join mapping'i.
//
// Detail endpoint'lerinin (my-requests/[id], approvals/[id]) eskiden tek bir
// büyük select stringi vardı: 13 farklı talep tipinin tüm join'lerini
// (items/prices/suppliers/checklist alanları dahil) her sorguda yapıyordu.
// Postgres bu join'leri her satıra paralel uyguladığı için talepler büyük
// hacme ulaştığında sorgu statement timeout (Postgres 57014) yiyor.
//
// Çözüm: önce hafif bir sorguyla request'in workflow_definition.code'unu
// öğren, sonra sadece o tipin nested join'ini içeren full select'i çek.
// 13 tip × tüm satırlar problemi 1 tip × tek satıra düşer.

// =====================================================================
// Liste için (my-requests sayfası tablosu)
// =====================================================================
// Tabloda gerçekte kullanılan alanlar:
//   - request.id, request_no, status, created_at, updated_at
//   - workflow_definition.name (Talep Tipi sütunu)
// "Detay" sütunu kaldırıldı, getRequestSummary çağrılmıyor — bu yüzden
// hiçbir spesifik talep tipi join'ine gerek yok.
//
// workflow_code filter'ı için workflow_definitions !inner gerekli (PostgREST
// embedded resource üzerinde .eq() yapmak için).
export const MY_REQUESTS_LIST_SELECT = `
  id,
  request_no,
  status,
  created_at,
  updated_at,
  workflow_definition:workflow_definitions!inner(id, code, name)
`;

// =====================================================================
// Detail için ortak (workflow code'dan bağımsız) join'ler
// =====================================================================
const REQUEST_BASE_DETAIL_SELECT = `
  *,
  workflow_definition:workflow_definitions(id, code, name),
  requester:employees!requester_employee_id(
    id,
    first_name,
    last_name,
    employee_no,
    employee_positions(
      position:positions(
        id,
        title
      ),
      is_primary,
      end_date
    )
  ),
  approvals:request_approvals(
    id,
    status,
    comment,
    decided_at,
    created_at,
    sequence_order,
    revision_cycle,
    workflow_step:workflow_steps(
      step_order,
      name,
      approver_type,
      phase,
      form_section_key
    ),
    approver:employees!approver_employee_id(
      id,
      first_name,
      last_name
    ),
    acted_by_employee_id,
    acted_by:employees!acted_by_employee_id(
      id,
      first_name,
      last_name
    )
  )
`;

// =====================================================================
// Workflow code → tipe özel join mapping
// =====================================================================
// Bu mapping yeni workflow tipi eklendikçe güncellenmeli. Mapping'de
// olmayan code'lar için fallback olarak "tip-spesifik join eklenmez";
// detay sayfası boş kalır ama 500 atmaz.
const WORKFLOW_CODE_TO_TYPE_JOIN: Record<string, string> = {
  ANNUAL_LEAVE: "leave_request:leave_requests(*)",
  SHORT_LEAVE: "leave_request:leave_requests(*)",
  SALARY_ADVANCE: "salary_advance_request:salary_advance_requests(*)",
  OVERTIME: "overtime_request:overtime_requests(*, entries:overtime_entries(*))",
  EMPLOYEE_ONBOARDING: "onboarding_request:onboarding_requests(*)",
  EMPLOYEE_SEPARATION: "separation_request:separation_requests(*)",
  REQUEST_FORM: "request_form_request:request_form_requests(*)",
  STAMP_APPROVAL: "stamp_request:stamp_requests(*, stamp:stamps(*))",
  TRAVEL_ASSIGNMENT:
    "travel_assignment_request:travel_assignment_requests(*, company:companies(*))",
  APPROVAL_LETTER: "approval_letter_request:approval_letter_requests(*)",
  FINANCE_APPROVAL_COVER:
    "finance_approval_cover_request:finance_approval_cover_requests(*, items:finance_approval_cover_items(*))",
  ACCOUNTING_APPROVAL_COVER:
    "accounting_approval_cover_request:accounting_approval_cover_requests(*, items:accounting_approval_cover_items(*))",
  COMPARISON_FORM:
    "mukayese_request:mukayese_requests(*, items:mukayese_items(*, prices:mukayese_prices(*)), suppliers:mukayese_suppliers(*))",
  EXPENSE_FORM: "expense_request:expense_requests(*, items:expense_items(*))",
};

/**
 * "requests" tablosundan tek bir kaydın detay select'ini döndürür.
 * Önce hafif sorguyla code çekilmeli, sonra bu helper çağrılmalı.
 */
export function getRequestDetailSelect(code: string | null | undefined): string {
  const typeJoin = code ? WORKFLOW_CODE_TO_TYPE_JOIN[code] : null;
  return typeJoin
    ? `${REQUEST_BASE_DETAIL_SELECT},\n  ${typeJoin}`
    : REQUEST_BASE_DETAIL_SELECT;
}

/**
 * "request_approvals" tablosundan tek bir kaydın (detail page) nested
 * select'ini döndürür. request → workflow_definition + requester + approvals
 * + tipe özel join içerir.
 */
export function getApprovalDetailSelect(code: string | null | undefined): string {
  const typeJoin = code ? WORKFLOW_CODE_TO_TYPE_JOIN[code] : null;
  const requestBlock = typeJoin
    ? `${REQUEST_BASE_DETAIL_SELECT},\n      ${typeJoin}`
    : REQUEST_BASE_DETAIL_SELECT;

  return `
    *,
    workflow_step:workflow_steps(*),
    request:requests(
      ${requestBlock}
    )
  `;
}
