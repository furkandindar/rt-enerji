// V5: Request Lifecycle — eligibility check'leri, approval chain reset, audit stamp

import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createApprovalChain } from './workflow-service';
import type {
  Request,
  RequestApproval,
  RequestStatus,
  CreateRequestDynamicApprovers,
} from './types';

// ============================================================================
// Eligibility — Pure Functions
// ============================================================================

export interface LifecycleUser {
  employeeId: string;
  role: string | null | undefined; // 'ORG_ADMIN' veya başka rol
}

/** Talep terminal duruma düşmüş mü (ileri akış mümkün değil)? */
const TERMINAL_FOR_CANCEL: ReadonlyArray<RequestStatus> = [
  'CANCELLED',
  'COMPLETED',
  'APPROVED',
];

/**
 * Edit: detay tablo + items üzerinde UPDATE. Status'u değiştirmez.
 * - Talep sahibi: status DRAFT veya REVISION_REQUESTED
 * - ORG_ADMIN: her durumda
 */
export function canEditRequest(
  req: Pick<Request, 'status' | 'requester_employee_id'>,
  user: LifecycleUser
): boolean {
  if (user.role === 'ORG_ADMIN') return true;
  if (req.requester_employee_id !== user.employeeId) return false;
  return req.status === 'DRAFT' || req.status === 'REVISION_REQUESTED';
}

/**
 * Withdraw: PENDING + aktif cycle'da hiç onay verilmemiş.
 * Approval listesi *aktif cycle'a filtrelenmiş* gelmelidir (çağıran sorumlu).
 */
export function canWithdrawRequest(
  req: Pick<Request, 'status' | 'requester_employee_id'>,
  activeCycleApprovals: Pick<RequestApproval, 'status'>[],
  user: LifecycleUser
): boolean {
  if (user.role !== 'ORG_ADMIN' && req.requester_employee_id !== user.employeeId) return false;
  if (req.status !== 'PENDING') return false;
  return activeCycleApprovals.every(a => a.status === 'PENDING');
}

/**
 * Cancel: status ∉ (CANCELLED, COMPLETED, APPROVED).
 * Talep sahibi veya ORG_ADMIN.
 */
export function canCancelRequest(
  req: Pick<Request, 'status' | 'requester_employee_id'>,
  user: LifecycleUser
): boolean {
  if (user.role !== 'ORG_ADMIN' && req.requester_employee_id !== user.employeeId) return false;
  return !TERMINAL_FOR_CANCEL.includes(req.status);
}

/**
 * Revision Request: Onaycı kendi PENDING kaydında, sırası gelmiş.
 */
export function canRequestRevision(
  approval: Pick<RequestApproval, 'status' | 'sequence_order' | 'approver_employee_id'>,
  req: Pick<Request, 'status' | 'current_step'>,
  user: LifecycleUser
): boolean {
  if (approval.approver_employee_id !== user.employeeId) return false;
  if (approval.status !== 'PENDING') return false;
  if (req.status !== 'PENDING') return false;
  return approval.sequence_order === req.current_step;
}

// ============================================================================
// Approval Chain Reset (V5)
// ============================================================================

/**
 * Koşullu adımlar (workflow_steps.condition) için formData'yı SUNUCUDAN, yani
 * doğruluk kaynağı olan süreç-detay tablosundan kurar. Resubmit/reset akışında
 * client'a güvenmemek için kullanılır: client boş gövde gönderse bile koşul
 * değerlendirmesi ilk gönderimdeki ile birebir aynı olur.
 *
 * Yeni koşullu workflow eklendiğinde bu switch genişletilir (tek merkez).
 * Koşullu adımı olmayan workflow'lar için undefined döner — createApprovalChain
 * undefined formData ile tüm adımları normal (koşulsuz) oluşturur.
 */
async function buildConditionFormData(
  supabase: SupabaseClient,
  requestId: string,
  workflowCode: string | null | undefined
): Promise<Record<string, unknown> | undefined> {
  switch (workflowCode) {
    case 'TRAVEL_ASSIGNMENT': {
      // Step 4 "Muhasebe" koşulu: { field: 'advance_requested', value: true }
      const { data } = await supabase
        .from('travel_assignment_requests')
        .select('advance_requested')
        .eq('request_id', requestId)
        .single();
      return { advance_requested: data?.advance_requested ?? false };
    }
    default:
      return undefined;
  }
}

/**
 * Bir talebin onay zincirini sıfırlar:
 *
 *  1. requests.current_revision_cycle değeri 1 artırılır
 *  2. createApprovalChain yeni cycle ile çağrılır → yeni PENDING kayıtları insert edilir
 *  3. Eski cycle'ın request_approvals kayıtları **silinmez** (audit için korunur)
 *
 * Service role client kullanır çünkü:
 *  - request_approvals'a insert: başkasının onay kaydı oluşturmamız gerekiyor
 *  - mevcut RLS policy buna izin vermez (insert policy sadece requester'ın ilk submit'i için)
 *
 * @returns Yeni cycle numarası
 */
export async function resetApprovalChain(
  requestId: string,
  formData?: Record<string, unknown>,
  dynamicApprovers?: CreateRequestDynamicApprovers
): Promise<{ newCycle: number }> {
  const serviceSupabase = createServiceRoleClient();

  const { data: req, error: reqError } = await serviceSupabase
    .from('requests')
    .select('id, workflow_definition_id, requester_employee_id, current_revision_cycle, workflow_definition:workflow_definitions(code)')
    .eq('id', requestId)
    .single();

  if (reqError || !req) {
    throw new Error(`Failed to load request for reset: ${reqError?.message ?? 'not found'}`);
  }

  const newCycle = ((req as { current_revision_cycle: number | null }).current_revision_cycle ?? 0) + 1;

  // Koşullu adımları doğru değerlendirmek için formData'yı sunucudan kur (client'a
  // güvenme). Çağıran açıkça formData verdiyse onu kullan (override); aksi halde
  // doğruluk kaynağı olan detay tablosundan oku. Böylece resubmit'te koşul atlama
  // mantığı ilk gönderimle aynı çalışır.
  const workflowCode = (req as unknown as { workflow_definition?: { code?: string } }).workflow_definition?.code;
  const effectiveFormData =
    formData ?? (await buildConditionFormData(serviceSupabase as unknown as SupabaseClient, requestId, workflowCode));

  const { error: bumpError } = await serviceSupabase
    .from('requests')
    .update({ current_revision_cycle: newCycle, current_step: 1 })
    .eq('id', requestId);

  if (bumpError) {
    throw new Error(`Failed to bump revision cycle: ${bumpError.message}`);
  }

  await createApprovalChain(
    serviceSupabase as unknown as SupabaseClient,
    requestId,
    req.workflow_definition_id,
    req.requester_employee_id,
    effectiveFormData,
    dynamicApprovers,
    newCycle
  );

  return { newCycle };
}

// ============================================================================
// Audit Stamp
// ============================================================================

/**
 * Bir lifecycle aksiyonu sonrası requests.last_action* alanlarını günceller.
 * Action örnekleri: 'WITHDRAWN', 'RESUBMITTED', 'REVISION_REQUESTED',
 *                   'CANCELLED', 'EDITED', 'EDITED_BY_ADMIN'.
 */
export async function applyAuditStamp(
  supabase: SupabaseClient,
  requestId: string,
  action: string,
  byEmployeeId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('requests')
    .update({
      last_action: action,
      last_action_at: new Date().toISOString(),
      last_action_by: byEmployeeId,
    })
    .eq('id', requestId);

  if (error) {
    console.error('[lifecycle] applyAuditStamp failed:', error);
  }
}
