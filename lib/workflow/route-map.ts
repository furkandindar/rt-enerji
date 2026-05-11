// V5: Workflow code → frontend form route eşlemesi.
// Yaşam döngüsü aksiyonları (Düzenle, Yeniden Gönder) bu eşlemeden
// "yeni talep" formuna `?edit=<requestId>` query'siyle yönlendirir.

/**
 * Düzenleme akışına dahil olan workflow code'ları → /<form>/new route'u.
 * Buraya eklenmeyen workflow tipleri için "Düzenle" butonu UI'da görünmez.
 */
export const WORKFLOW_EDIT_ROUTE: Record<string, string> = {
  ANNUAL_LEAVE: '/leave-requests/new',
  SHORT_LEAVE: '/leave-requests/new',
  EXPENSE_FORM: '/expense-form/new',
  COMPARISON_FORM: '/comparison-form/new',
  SALARY_ADVANCE: '/salary-advance/new',
  OVERTIME: '/overtime/new',
  EMPLOYEE_SEPARATION: '/separation/new',
  TRAVEL_ASSIGNMENT: '/travel-assignment/new',
  REQUEST_FORM: '/request-form/new',
};

/**
 * Workflow code'una karşılık düzenleme URL'ini üretir.
 * Tip desteklenmiyorsa null döner — UI buton göstermemeli.
 */
export function getEditUrl(workflowCode: string | null | undefined, requestId: string): string | null {
  if (!workflowCode) return null;
  const base = WORKFLOW_EDIT_ROUTE[workflowCode];
  if (!base) return null;
  return `${base}?edit=${encodeURIComponent(requestId)}`;
}

/**
 * PATCH API endpoint'inin yolu (lifecycle aksiyonları için).
 * Eğer null dönerse bu workflow için edit destek yok demektir.
 */
export const WORKFLOW_PATCH_ROUTE: Record<string, string> = {
  ANNUAL_LEAVE: '/api/leave-requests',
  SHORT_LEAVE: '/api/leave-requests',
  EXPENSE_FORM: '/api/expense-form',
  COMPARISON_FORM: '/api/comparison-form',
  SALARY_ADVANCE: '/api/salary-advance',
  OVERTIME: '/api/overtime',
  EMPLOYEE_SEPARATION: '/api/separation',
  TRAVEL_ASSIGNMENT: '/api/travel-assignment',
  REQUEST_FORM: '/api/request-form',
};

export function getPatchUrl(workflowCode: string | null | undefined, requestId: string): string | null {
  if (!workflowCode) return null;
  const base = WORKFLOW_PATCH_ROUTE[workflowCode];
  if (!base) return null;
  return `${base}/${encodeURIComponent(requestId)}`;
}
