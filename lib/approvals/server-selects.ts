// Approvals liste endpoint'leri için minimal Supabase select string'i.
//
// Pending + history tablolarında gerçekte kullanılan alanlar:
//   - approval.id, status, decided_at, request_id (status/decided_at sadece history)
//   - approval.request.{id, request_no, status, created_at, updated_at}
//   - approval.request.workflow_definition.{code, name}
//   - approval.request.requester.{first_name, last_name, employee_no}
//
// Çıkarılanlar (büyük performans kazancı):
//   - workflow_step join'i (liste'de yok)
//   - request.approvals self-reference (liste'de yok, en pahalı kısım)
//   - Tüm spesifik talep tipi join'leri (leave/salary/overtime/onboarding/
//     separation/request_form/stamp/travel/approval_letter): "Detay" sütunu
//     kaldırıldığı için getRequestSummary çağrılmıyor, bu join'ler israf.
//   - stamps tablosuna giden ek join
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
    )
  )
`;
