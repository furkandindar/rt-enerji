// Approvals liste endpoint'leri için minimal Supabase select string'i.
//
// Pending + history tablolarında gerçekte kullanılan alanlar:
//   - approval.id, status, decided_at, request_id (status/decided_at sadece history)
//   - approval.request.{id, request_no, status, created_at, updated_at}
//   - approval.request.workflow_definition.{code, name}
//   - approval.request.requester.{first_name, last_name, employee_no}
//   - "Talep Konusu" sütunu için tipe özel 1:1 join'lerden YALNIZ konu
//     alanları (getRequestSummary bunları okur)
//
// Tipe özel join'ler bilinçli olarak skalar-only: nested array (items/prices/
// suppliers/entries), stamps join'i ve request.approvals self-reference YOK —
// eski statement timeout problemi bunlardan geliyordu. Her iki endpoint de
// önce view'dan paged id seti çekip select'i en fazla page_size satıra
// uyguladığı için bu skalar join'ler ucuz kalır.
//
// Çıkarılanlar (büyük performans kazancı):
//   - workflow_step join'i (liste'de yok)
//   - request.approvals self-reference (liste'de yok, en pahalı kısım)
//   - requester.employee_positions (liste'de yok)
//
// Detail page (/api/approvals/[id]) ayrı endpoint olarak full nested select
// yapmaya devam ediyor — orada gerçekten ihtiyaç var.
export const APPROVAL_LIST_SELECT = `
  *,
  request:requests(
    id,
    request_no,
    status,
    created_at,
    updated_at,
    workflow_definition:workflow_definitions(id, code, name),
    requester:employees!requests_requester_employee_id_fkey(
      first_name,
      last_name,
      employee_no
    ),
    leave_request:leave_requests(leave_type),
    salary_advance_request:salary_advance_requests(amount),
    overtime_request:overtime_requests(month, year, overtime_type),
    onboarding_request:onboarding_requests(employee_name),
    separation_request:separation_requests(employee_name),
    request_form_request:request_form_requests(subject),
    stamp_request:stamp_requests(subject),
    travel_assignment_request:travel_assignment_requests(assignment_subject, destination_city),
    approval_letter_request:approval_letter_requests(subject),
    finance_approval_cover_request:finance_approval_cover_requests(subject),
    accounting_approval_cover_request:accounting_approval_cover_requests(subject),
    mukayese_request:mukayese_requests(subject),
    expense_request:expense_requests(project_name)
  )
`;
