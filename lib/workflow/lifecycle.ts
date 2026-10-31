// V5: Request Lifecycle — eligibility check'leri, approval chain reset, audit stamp

import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  resolveApprovalChain,
  insertApprovalChain,
  buildCarriedApprovalFields,
  type CarryOverSourceRow,
} from './workflow-service';
import type { RevisionReturnMode } from './revision-target';
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
 * Bir onaycının onay/red kararı verebileceği talep statüleri.
 * Yalnızca akış canlıyken (approval fazı = PENDING, completion fazı =
 * AWAITING_COMPLETION) karar alınabilir. Terminal bir talebe (CANCELLED /
 * REJECTED / COMPLETED / APPROVED) karar vermek final statüyü ezer → bunu
 * karar route'unda engelliyoruz.
 */
export const ACTIONABLE_REQUEST_STATUSES: ReadonlyArray<RequestStatus> = [
  'PENDING',
  'AWAITING_COMPLETION',
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
 * Cancel: talebi CANCELLED'a çeker (terminal). Faz-bazlı yetki:
 *  - ORG_ADMIN: terminal olmayan her durumda. İmza ilerlemiş veya completion
 *    fazına geçmiş ("takılı") talepleri de sonlandırabilen escape hatch.
 *  - Talep eden: YALNIZCA imza öncesi — status PENDING ve aktif cycle'da hiç
 *    gerçek onay verilmemiş (withdraw ile aynı eşik). İmzalardan geçmiş bir
 *    talebi talep eden tek taraflı iptal edemez; bir ORG_ADMIN'e başvurur.
 *
 * activeCycleRealApprovals: aktif revize cycle'ının onay kayıtları, REQUESTER
 * tipindeki (talep gönderme imzası) adımlar HARİÇ — filtreleme çağırana ait.
 */
export function canCancelRequest(
  req: Pick<Request, 'status' | 'requester_employee_id'>,
  activeCycleRealApprovals: Pick<RequestApproval, 'status'>[],
  user: LifecycleUser
): boolean {
  if (TERMINAL_FOR_CANCEL.includes(req.status)) return false;
  if (user.role === 'ORG_ADMIN') return true;
  if (req.requester_employee_id !== user.employeeId) return false;
  if (req.status !== 'PENDING') return false;
  return activeCycleRealApprovals.every(a => a.status === 'PENDING');
}

/**
 * Revision Request: Onaycı kendi PENDING kaydında, sırası gelmiş.
 */
export function canRequestRevision(
  approval: Pick<RequestApproval, 'status' | 'sequence_order' | 'approver_employee_id'>,
  req: Pick<Request, 'status' | 'current_step'>,
  user: LifecycleUser,
  // Vekalet (B2): verilirse "kendisi mi" karşılaştırması yerine DB'den çözülmüş
  // işlem yetkisi (resolveActingRights → can_act_on_approval) kullanılır.
  acting?: { canAct: boolean }
): boolean {
  const isActor = acting ? acting.canAct : approval.approver_employee_id === user.employeeId;
  if (!isActor) return false;
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
 * options.requesterComment: talep sahibinin "Revize Açıklaması"; yeni cycle'ın
 * oto-onaylanan ilk REQUESTER satırına comment olarak yazılır (insert anında).
 * options.carryOverFrom: önceki turun satırları — revizeyi isteyen "doğrudan bana
 * dönsün" dediyse verilir; geçerli onaylar yeni tura taşınır (createApprovalChain).
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
  dynamicApprovers?: CreateRequestDynamicApprovers,
  options?: { requesterComment?: string | null; carryOverFrom?: CarryOverSourceRow[] }
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

  // Zincir cycle artırılmadan ÖNCE çözülür: onaycısı bulunamayan adım varsa
  // (ApprovalChainResolutionError) talep hiç değişmeden eski durumunda kalır.
  const chain = await resolveApprovalChain(
    serviceSupabase as unknown as SupabaseClient,
    req.workflow_definition_id,
    req.requester_employee_id,
    effectiveFormData,
    dynamicApprovers
  );

  const { error: bumpError } = await serviceSupabase
    .from('requests')
    .update({ current_revision_cycle: newCycle, current_step: 1 })
    .eq('id', requestId);

  if (bumpError) {
    throw new Error(`Failed to bump revision cycle: ${bumpError.message}`);
  }

  await insertApprovalChain(
    serviceSupabase as unknown as SupabaseClient,
    requestId,
    chain,
    newCycle,
    {
      firstStepComment: options?.requesterComment ?? null,
      carryOverFrom: options?.carryOverFrom,
    }
  );

  return { newCycle };
}

// ============================================================================
// Ara adıma revize (revize sorumlusu talep sahibi değil)
// ============================================================================

interface RewindSourceRow extends CarryOverSourceRow {
  sequence_order: number;
  workflow_step?: { approver_type?: string | null } | null;
}

/**
 * Yeni turun satırlarını önceki turdan kurar (saf fonksiyon). Zincir yapısı
 * AYNEN kopyalanır — onaycı yeniden çözülmez, form değişmediği için koşullu /
 * dinamik / ek onaycı satırları da aynı kalır (yolda olan zincir hiçbir zaman
 * yeniden çözülmez; tam sıfırlama yalnız talep sahibi yeniden gönderince olur).
 *
 *   - sorumludan önceki satırlar: taşınır (hepsi onaylıdır);
 *   - sorumlunun satırı: PENDING (düzeltip yeniden onaylar);
 *   - sonrası: RETURN_TO_REVIEWER'da önceki turda onaylı olanlar taşınır (aradaki
 *     adımlar + ileri SIGN_ONLY oto-onayları), diğerleri PENDING. Revizeyi
 *     isteyenin satırı REVISION_REQUESTED olduğundan her iki modda PENDING kalır.
 */
export function planRewindRows(
  rows: RewindSourceRow[],
  target: { id: string; sequence_order: number },
  mode: RevisionReturnMode
): Array<{
  workflow_step_id: string;
  approver_employee_id: string;
  sequence_order: number;
  status: 'PENDING' | 'APPROVED';
  decided_at: string | null;
  comment: string | null;
  acted_by_employee_id: string | null;
  carried_over_from_id?: string;
}> {
  return [...rows]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((row) => {
      const base = {
        workflow_step_id: row.workflow_step_id,
        approver_employee_id: row.approver_employee_id,
        sequence_order: row.sequence_order,
      };
      const carry =
        row.id !== target.id &&
        row.status === 'APPROVED' &&
        (row.sequence_order < target.sequence_order || mode === 'RETURN_TO_REVIEWER');
      if (carry) {
        const isRequesterSubmission =
          row.sequence_order === 1 && row.workflow_step?.approver_type === 'REQUESTER';
        return { ...base, ...buildCarriedApprovalFields(row, isRequesterSubmission) };
      }
      return {
        ...base,
        status: 'PENDING' as const,
        decided_at: null,
        comment: null,
        acted_by_employee_id: null,
      };
    });
}

export type RevisionRewindErrorCode = 'STATE_CHANGED' | 'TARGET_NOT_FOUND' | 'WRITE_FAILED';

export class RevisionRewindError extends Error {
  readonly code: RevisionRewindErrorCode;
  constructor(message: string, code: RevisionRewindErrorCode) {
    super(message);
    this.name = 'RevisionRewindError';
    this.code = code;
  }
}

/**
 * Revizeyi ara adıma gönderir: önceki tur kopyalanarak yeni tur açılır, talep
 * sorumlunun adımında PENDING olarak devam eder (REVISION_REQUESTED'a düşmez,
 * talep sahibinin yeniden göndermesi beklenmez).
 *
 * Çağıran, revizeyi isteyenin satırını önceden REVISION_REQUESTED yapmış olmalı
 * (aksi halde o satır yeni turda zaten PENDING kopyalanır, sorun olmaz ama
 * eşzamanlı onay engellenmemiş olur). Hata olursa yeni tur hiç görünür olmaz:
 *   1. Bu tur numarasıyla kalmış yetim satırlar temizlenir (önceki bir denemenin
 *      çökmesinden; current_revision_cycle henüz eski turda olduğundan hiçbir
 *      ekranda görünmezler ama sonraki tur kurulumunda UNIQUE çakışması yaratırlar).
 *   2. Yeni tur satırları eklenir — tur numarası artırılmadan görünmez.
 *   3. Talep, tur hâlâ beklenen değerdeyken (koşullu update) yeni tura geçirilir;
 *      başarısızsa eklenen satırlar geri silinir.
 *
 * Service role: başkalarının onay satırları oluşturulur (resetApprovalChain ile aynı gerekçe).
 */
export async function rewindApprovalChain(
  requestId: string,
  params: { targetApprovalId: string; mode: RevisionReturnMode; expectedCycle: number }
): Promise<{ newCycle: number; targetSequence: number; targetEmployeeId: string }> {
  const serviceSupabase = createServiceRoleClient();
  const { expectedCycle, mode } = params;

  const { data: rows, error: rowsError } = await serviceSupabase
    .from('request_approvals')
    .select(`
      id,
      workflow_step_id,
      approver_employee_id,
      status,
      decided_at,
      comment,
      acted_by_employee_id,
      carried_over_from_id,
      sequence_order,
      workflow_step:workflow_steps(approver_type)
    `)
    .eq('request_id', requestId)
    .eq('revision_cycle', expectedCycle)
    .order('sequence_order', { ascending: true });

  if (rowsError || !rows?.length) {
    throw new RevisionRewindError(
      `Failed to load approval chain: ${rowsError?.message ?? 'empty'}`,
      'WRITE_FAILED'
    );
  }

  const sourceRows = rows as unknown as RewindSourceRow[];
  const target = sourceRows.find((r) => r.id === params.targetApprovalId);
  if (!target) {
    throw new RevisionRewindError('Revision target is not in the active chain', 'TARGET_NOT_FOUND');
  }

  const newCycle = expectedCycle + 1;
  const planned = planRewindRows(sourceRows, target, mode);

  // 1. Yetim satır temizliği (yalnız henüz açılmamış tur numarası)
  await serviceSupabase
    .from('request_approvals')
    .delete()
    .eq('request_id', requestId)
    .eq('revision_cycle', newCycle);

  // 2. Yeni tur satırları
  const { error: insertError } = await serviceSupabase.from('request_approvals').insert(
    planned.map((row) => ({ ...row, request_id: requestId, revision_cycle: newCycle }))
  );
  if (insertError) {
    throw new RevisionRewindError(`Failed to insert rewind chain: ${insertError.message}`, 'WRITE_FAILED');
  }

  // 3. Talebi yeni tura geçir (tur değişmediyse)
  const { data: bumped, error: bumpError } = await serviceSupabase
    .from('requests')
    .update({
      current_revision_cycle: newCycle,
      current_step: target.sequence_order,
      status: 'PENDING',
    })
    .eq('id', requestId)
    .eq('current_revision_cycle', expectedCycle)
    .select('id');

  if (bumpError || !bumped?.length) {
    await serviceSupabase
      .from('request_approvals')
      .delete()
      .eq('request_id', requestId)
      .eq('revision_cycle', newCycle);
    throw new RevisionRewindError(
      `Failed to switch request to rewind cycle: ${bumpError?.message ?? 'cycle changed'}`,
      bumpError ? 'WRITE_FAILED' : 'STATE_CHANGED'
    );
  }

  return {
    newCycle,
    targetSequence: target.sequence_order,
    targetEmployeeId: target.approver_employee_id,
  };
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
