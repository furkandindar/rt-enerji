// Ek onaycı (yöneticinin onay zincirine kişi eklemesi) — sunucu tarafı.
//
// Akışlar (bkz. sql/feature_olur_extra_approvers.sql başlığı):
//  - Oluşturma / resubmit: talep sahibinin opsiyonel seçimleri doğrulanır
//    (sanitizeRequesterExtraApprovers); resubmit'te yöneticinin kilitli
//    eklemeleriyle birleştirilir (buildResubmitDynamicApprovers).
//  - REVISION modu: revize isteğiyle birlikte kilitli kayıt yazılır
//    (recordRevisionExtraApprovers); satırlar yeni turda resubmit ile oluşur.
//  - DIRECT modu: mevcut tura atomik RPC ile eklenir (insertExtraApproversDirect).
//
// Uygunluk kuralı: aktif (employees.status = ACTIVE) VE sistem hesabı bağlı
// (app_users.employee_id) çalışan. Hesabı olmayan/pasif kişi onaycı yapılırsa
// zincir kilitlenir (bkz. "Müdür Test" vakası).
//
// Uygunluk/kilitli kayıt fonksiyonları service role client bekler (app_users
// başkasına RLS ile kapalı; request_extra_approvers'ın yazma policy'si yok) —
// client'ı çağıran verir. Yalnız sunucu kodu içindir, index.ts'ten re-export
// EDİLMEZ; doğrudan '@/lib/workflow/extra-approvers' import edilir
// (delegation.ts ile aynı desen). Client-safe saf kısım: ./extra-approvers-shared.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateRequestDynamicApprovers } from './types';
import {
  MAX_EXTRA_APPROVERS,
  mergeWithLockedApprovers,
  resolveExtraApproverTarget,
  type ExtraApproverStepLike,
  type ExtraApproverTarget,
} from './extra-approvers-shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Okuma yardımcıları
// ============================================================================

/**
 * Sürecin adımlarını getirir. Bilerek select('*'): can_add_extra_approvers
 * kolonu SQL uygulanmadan önce yoktur; adıyla seçmek o durumda sorguyu
 * düşürürdü. Kolon yoksa undefined → özellik kapalı.
 */
export async function fetchWorkflowStepsForExtras(
  client: SupabaseClient,
  workflowDefinitionId: string
): Promise<ExtraApproverStepLike[]> {
  const { data, error } = await client
    .from('workflow_steps')
    .select('*')
    .eq('workflow_definition_id', workflowDefinitionId)
    .order('step_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to load workflow steps: ${error.message}`);
  }
  return (data ?? []) as ExtraApproverStepLike[];
}

/** Verilen id'lerden onaycı olamayacakları (pasif / sistem hesabı yok) döndürür. */
export async function findIneligibleApproverIds(
  admin: SupabaseClient,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];

  const [employeesRes, usersRes] = await Promise.all([
    admin.from('employees').select('id').in('id', ids).eq('status', 'ACTIVE'),
    admin.from('app_users').select('employee_id').in('employee_id', ids),
  ]);

  if (employeesRes.error || usersRes.error) {
    throw new Error(
      `Failed to check approver eligibility: ${employeesRes.error?.message ?? usersRes.error?.message}`
    );
  }

  const active = new Set((employeesRes.data ?? []).map((e: { id: string }) => e.id));
  const linked = new Set(
    (usersRes.data ?? []).map((u: { employee_id: string | null }) => u.employee_id)
  );
  return ids.filter((id) => !(active.has(id) && linked.has(id)));
}

export interface ApproverCandidate {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string | null;
  position_title: string | null;
}

interface PositionLinkRow {
  id: string;
  employee_positions?: Array<{
    is_primary: boolean;
    end_date: string | null;
    position?: { title: string | null } | { title: string | null }[] | null;
  }> | null;
}

interface CandidateRow extends PositionLinkRow {
  first_name: string;
  last_name: string;
  employee_no: string | null;
}

function pickPositionTitle(row: PositionLinkRow): string | null {
  const active = (row.employee_positions ?? []).filter((ep) => ep.end_date === null);
  const chosen = active.find((ep) => ep.is_primary) ?? active[0];
  const position = Array.isArray(chosen?.position) ? chosen?.position[0] : chosen?.position;
  return position?.title ?? null;
}

/** Ek onaycı seçicisinin aday listesi: aktif + sistem hesabı bağlı çalışanlar. */
export async function listApproverCandidates(admin: SupabaseClient): Promise<ApproverCandidate[]> {
  const [employeesRes, usersRes] = await Promise.all([
    admin
      .from('employees')
      .select(
        'id, first_name, last_name, employee_no, employee_positions(is_primary, end_date, position:positions(title))'
      )
      .eq('status', 'ACTIVE')
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true }),
    admin.from('app_users').select('employee_id').not('employee_id', 'is', null),
  ]);

  if (employeesRes.error || usersRes.error) {
    throw new Error(
      `Failed to load approver candidates: ${employeesRes.error?.message ?? usersRes.error?.message}`
    );
  }

  const linked = new Set(
    (usersRes.data ?? []).map((u: { employee_id: string | null }) => u.employee_id)
  );

  return ((employeesRes.data ?? []) as CandidateRow[])
    .filter((e) => linked.has(e.id))
    .map((e) => ({
      id: e.id,
      first_name: e.first_name,
      last_name: e.last_name,
      employee_no: e.employee_no,
      position_title: pickPositionTitle(e),
    }));
}

/** Primary (yoksa herhangi bir aktif) pozisyon başlıkları — PDF kolon başlığı için. */
export async function getPositionTitlesByEmployee(
  client: SupabaseClient,
  employeeIds: string[]
): Promise<Record<string, string>> {
  if (employeeIds.length === 0) return {};

  const { data, error } = await client
    .from('employees')
    .select('id, employee_positions(is_primary, end_date, position:positions(title))')
    .in('id', employeeIds);

  if (error) {
    throw new Error(`Failed to load position titles: ${error.message}`);
  }

  const titles: Record<string, string> = {};
  for (const row of (data ?? []) as PositionLinkRow[]) {
    const title = pickPositionTitle(row);
    if (title) titles[row.id] = title;
  }
  return titles;
}

/** Ad Soyad listesi, verilen id sırasıyla (bildirim metinleri için). */
export async function getEmployeeNamesInOrder(
  client: SupabaseClient,
  employeeIds: string[]
): Promise<string[]> {
  if (employeeIds.length === 0) return [];
  const { data } = await client
    .from('employees')
    .select('id, first_name, last_name')
    .in('id', employeeIds);

  const byId = new Map(
    (data ?? []).map((e: { id: string; first_name: string; last_name: string }) => [
      e.id,
      `${e.first_name} ${e.last_name}`.trim(),
    ])
  );
  return employeeIds.map((id) => byId.get(id) ?? 'Bilinmeyen çalışan');
}

export interface LockedExtraApprover {
  id: string;
  employee_id: string;
  workflow_step_id: string;
  sort_order: number;
  added_by_employee_id: string;
  added_in_cycle: number;
  mode: 'REVISION' | 'DIRECT';
  note: string | null;
  created_at: string;
}

/**
 * Yöneticinin talebe eklediği kilitli kişiler, ekleme sırasıyla.
 * Yalnız ek onaycı desteği olan süreçlerde çağrılmalı (tablo SQL ile gelir).
 */
export async function loadLockedExtraApprovers(
  client: SupabaseClient,
  requestId: string
): Promise<LockedExtraApprover[]> {
  const { data, error } = await client
    .from('request_extra_approvers')
    .select('id, employee_id, workflow_step_id, sort_order, added_by_employee_id, added_in_cycle, mode, note, created_at')
    .eq('request_id', requestId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to load locked extra approvers: ${error.message}`);
  }
  return (data ?? []) as LockedExtraApprover[];
}

// ============================================================================
// Talep sahibinin seçimleri (oluşturma + resubmit)
// ============================================================================

export type SanitizeExtraApproversResult =
  | { ok: true; value: CreateRequestDynamicApprovers | undefined }
  | { ok: false; error: string };

/**
 * Talep sahibinin gönderdiği dinamik onaycı haritasını doğrular.
 * - Anahtarlar bu sürecin DYNAMIC_USER_LIST adımları olmalı
 * - Değerler uuid listesi; tekrarlar, talep sahibi ve `ignoreIds` (kilitliler) ayıklanır
 * - Adım başına en fazla MAX_EXTRA_APPROVERS kişi; hepsi uygun (aktif + hesaplı) olmalı
 * Boş liste korunur (resubmit'te "açıkça boş" = dinamik adım atlanır).
 */
export async function sanitizeRequesterExtraApprovers(
  admin: SupabaseClient,
  params: {
    steps: ExtraApproverStepLike[];
    requesterEmployeeId: string;
    input: unknown;
    ignoreIds?: string[];
  }
): Promise<SanitizeExtraApproversResult> {
  const { steps, requesterEmployeeId, input, ignoreIds = [] } = params;
  if (input === undefined || input === null) return { ok: true, value: undefined };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Geçersiz onaycı listesi' };
  }

  const dynamicStepIds = new Set(
    steps.filter((s) => s.approver_type === 'DYNAMIC_USER_LIST').map((s) => s.id)
  );
  const ignore = new Set([requesterEmployeeId, ...ignoreIds]);
  const result: CreateRequestDynamicApprovers = {};
  const toCheck = new Set<string>();

  for (const [stepId, rawList] of Object.entries(input as Record<string, unknown>)) {
    if (!dynamicStepIds.has(stepId)) {
      return { ok: false, error: 'Geçersiz onaycı adımı' };
    }
    if (!Array.isArray(rawList) || rawList.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
      return { ok: false, error: 'Geçersiz onaycı listesi' };
    }
    const unique = Array.from(new Set(rawList as string[])).filter((id) => !ignore.has(id));
    if (unique.length > MAX_EXTRA_APPROVERS) {
      return { ok: false, error: `En fazla ${MAX_EXTRA_APPROVERS} ek onaycı seçilebilir` };
    }
    result[stepId] = unique;
    unique.forEach((id) => toCheck.add(id));
  }

  const ineligible = await findIneligibleApproverIds(admin, Array.from(toCheck));
  if (ineligible.length > 0) {
    const names = await getEmployeeNamesInOrder(admin, ineligible);
    return {
      ok: false,
      error: `Şu kişiler onaycı olarak seçilemez (pasif veya sistem hesabı yok): ${names.join(', ')}`,
    };
  }

  return { ok: true, value: result };
}

/**
 * Resubmit'te yeni turun dinamik onaycılarını kurar:
 * talep sahibinin listesi (body ya da önceki tur) + yöneticinin kilitli eklemeleri.
 * Arada pasifleşen / hesabı kaldırılan kişi düşürülür (zincir kilitlenmesin) ve loglanır.
 */
export async function buildResubmitDynamicApprovers(
  admin: SupabaseClient,
  params: {
    steps: ExtraApproverStepLike[];
    requestId: string;
    requesterEmployeeId: string;
    base: CreateRequestDynamicApprovers | undefined;
  }
): Promise<CreateRequestDynamicApprovers | undefined> {
  const { steps, requestId, requesterEmployeeId, base } = params;

  const dynamicStepIds = new Set(
    steps.filter((s) => s.approver_type === 'DYNAMIC_USER_LIST').map((s) => s.id)
  );

  const lockedByStep: Record<string, string[]> = {};
  for (const row of await loadLockedExtraApprovers(admin, requestId)) {
    if (!dynamicStepIds.has(row.workflow_step_id)) {
      console.warn('[extra-approvers] locked approver targets a non-dynamic step, skipped:', row.id);
      continue;
    }
    (lockedByStep[row.workflow_step_id] ||= []).push(row.employee_id);
  }

  const stepIds = new Set([...Object.keys(base ?? {}), ...Object.keys(lockedByStep)]);
  if (stepIds.size === 0) return base;

  const merged: CreateRequestDynamicApprovers = {};
  const allIds = new Set<string>();
  for (const stepId of stepIds) {
    if (!dynamicStepIds.has(stepId)) continue;
    merged[stepId] = mergeWithLockedApprovers(base?.[stepId] ?? [], lockedByStep[stepId] ?? []).filter(
      (id) => id !== requesterEmployeeId
    );
    merged[stepId].forEach((id) => allIds.add(id));
  }

  const ineligible = new Set(await findIneligibleApproverIds(admin, Array.from(allIds)));
  if (ineligible.size > 0) {
    console.warn('[extra-approvers] ineligible approvers dropped on resubmit:', requestId, Array.from(ineligible));
    for (const stepId of Object.keys(merged)) {
      merged[stepId] = merged[stepId].filter((id) => !ineligible.has(id));
    }
  }

  return merged;
}

// ============================================================================
// Yöneticinin eklemesi (REVISION + DIRECT ortak doğrulama)
// ============================================================================

export type ManagerExtraApproversResult =
  | { ok: true; employeeIds: string[]; target: ExtraApproverTarget }
  | { ok: false; status: 400 | 403 | 409; error: string };

/**
 * Yöneticinin (bayraklı adımın onaycısı) ekleme isteğini doğrular. Çağıran,
 * onay satırı üzerindeki işlem yetkisini (sıra, statü, tur) ayrıca kontrol eder.
 */
export async function validateManagerExtraApprovers(
  admin: SupabaseClient,
  params: {
    requestId: string;
    workflowDefinitionId: string;
    managerStepId: string;
    requesterEmployeeId: string;
    actorEmployeeId: string;
    cycle: number;
    rawIds: unknown;
  }
): Promise<ManagerExtraApproversResult> {
  const { requestId, workflowDefinitionId, managerStepId, requesterEmployeeId, actorEmployeeId, cycle, rawIds } =
    params;

  if (!Array.isArray(rawIds) || rawIds.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
    return { ok: false, status: 400, error: 'Geçersiz kişi listesi' };
  }
  const ids = rawIds as string[];
  if (ids.length === 0) {
    return { ok: false, status: 400, error: 'En az bir kişi seçmelisiniz' };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, status: 400, error: 'Aynı kişi birden fazla kez eklenemez' };
  }

  const steps = await fetchWorkflowStepsForExtras(admin, workflowDefinitionId);
  const managerStep = steps.find((s) => s.id === managerStepId);
  if (managerStep?.can_add_extra_approvers !== true) {
    return { ok: false, status: 403, error: 'Bu onay adımında ek onaycı eklenemez' };
  }
  const target = resolveExtraApproverTarget(steps, managerStepId);
  if (!target) {
    return {
      ok: false,
      status: 409,
      error: 'Süreç yapılandırması eksik: ek onaycıların ekleneceği adım bulunamadı',
    };
  }

  if (ids.includes(requesterEmployeeId)) {
    return { ok: false, status: 400, error: 'Talep sahibi ek onaycı olarak eklenemez' };
  }
  if (ids.includes(actorEmployeeId)) {
    return { ok: false, status: 400, error: 'Kendinizi ek onaycı olarak ekleyemezsiniz' };
  }

  const [chainRes, locked] = await Promise.all([
    admin
      .from('request_approvals')
      .select('approver_employee_id')
      .eq('request_id', requestId)
      .eq('revision_cycle', cycle),
    loadLockedExtraApprovers(admin, requestId),
  ]);
  if (chainRes.error) {
    throw new Error(`Failed to load approval chain: ${chainRes.error.message}`);
  }

  const inChain = new Set(
    (chainRes.data ?? []).map((r: { approver_employee_id: string }) => r.approver_employee_id)
  );
  const alreadyInChain = ids.filter((id) => inChain.has(id));
  if (alreadyInChain.length > 0) {
    const names = await getEmployeeNamesInOrder(admin, alreadyInChain);
    return { ok: false, status: 400, error: `Şu kişiler zaten onay zincirinde: ${names.join(', ')}` };
  }

  const lockedIds = new Set(locked.map((l) => l.employee_id));
  const alreadyAdded = ids.filter((id) => lockedIds.has(id));
  if (alreadyAdded.length > 0) {
    const names = await getEmployeeNamesInOrder(admin, alreadyAdded);
    return { ok: false, status: 400, error: `Şu kişiler bu talebe zaten eklenmiş: ${names.join(', ')}` };
  }

  if (locked.length + ids.length > MAX_EXTRA_APPROVERS) {
    return {
      ok: false,
      status: 400,
      error: `Bir talebe toplamda en fazla ${MAX_EXTRA_APPROVERS} ek onaycı eklenebilir`,
    };
  }

  const ineligible = await findIneligibleApproverIds(admin, ids);
  if (ineligible.length > 0) {
    const names = await getEmployeeNamesInOrder(admin, ineligible);
    return {
      ok: false,
      status: 400,
      error: `Şu kişiler onaycı olarak eklenemez (pasif veya sistem hesabı yok): ${names.join(', ')}`,
    };
  }

  return { ok: true, employeeIds: ids, target };
}

// ============================================================================
// Yazma
// ============================================================================

/**
 * REVISION modu: kilitli kayıtları yazar. Satırlar bu turda OLUŞMAZ; talep
 * sahibi yeniden gönderince resubmit yeni tura ekler. Başarısız revize
 * sonrası geri almak için yazılan kayıt id'leri döner.
 */
export async function recordRevisionExtraApprovers(
  admin: SupabaseClient,
  params: {
    requestId: string;
    dynamicStepId: string;
    employeeIds: string[];
    addedByEmployeeId: string;
    cycle: number;
    note: string | null;
  }
): Promise<string[]> {
  const { requestId, dynamicStepId, employeeIds, addedByEmployeeId, cycle, note } = params;

  const { data: maxRow, error: maxError } = await admin
    .from('request_extra_approvers')
    .select('sort_order')
    .eq('request_id', requestId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) {
    throw new Error(`Failed to read extra approver order: ${maxError.message}`);
  }
  const baseSort = (maxRow as { sort_order?: number } | null)?.sort_order ?? 0;

  const { data, error } = await admin
    .from('request_extra_approvers')
    .insert(
      employeeIds.map((employeeId, idx) => ({
        request_id: requestId,
        workflow_step_id: dynamicStepId,
        employee_id: employeeId,
        sort_order: baseSort + idx + 1,
        added_by_employee_id: addedByEmployeeId,
        added_in_cycle: cycle,
        mode: 'REVISION',
        note: note?.trim() || null,
      }))
    )
    .select('id');

  if (error) {
    throw new Error(`Failed to record extra approvers: ${error.message}`);
  }
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** REVISION modu geri alma (revize kaydı yazılamazsa kilitli kayıt yetim kalmasın). */
export async function deleteExtraApproverRecords(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from('request_extra_approvers').delete().in('id', ids);
  if (error) {
    console.error('[extra-approvers] rollback of extra approver records failed:', ids, error);
  }
}

export type DirectInsertResult = { ok: true } | { ok: false; status: 409 | 500; error: string };

/**
 * DIRECT modu: mevcut turda yöneticinin satırının hemen önüne atomik ekleme
 * (RPC insert_extra_approvers_before — durum kontrolü talep satırı kilitliyken).
 */
export async function insertExtraApproversDirect(
  admin: SupabaseClient,
  params: {
    beforeApprovalId: string;
    dynamicStepId: string;
    employeeIds: string[];
    addedByEmployeeId: string;
    note: string | null;
  }
): Promise<DirectInsertResult> {
  const { error } = await admin.rpc('insert_extra_approvers_before', {
    p_before_approval_id: params.beforeApprovalId,
    p_dynamic_step_id: params.dynamicStepId,
    p_employee_ids: params.employeeIds,
    p_added_by_employee_id: params.addedByEmployeeId,
    p_note: params.note?.trim() || null,
  });

  if (!error) return { ok: true };

  const message = error.message ?? '';
  if (message.includes('EXTRA_APPROVERS_STATE_MISMATCH')) {
    return { ok: false, status: 409, error: 'Talebin durumu değişmiş. Sayfayı yenileyip tekrar deneyin.' };
  }
  if (message.includes('EXTRA_APPROVERS_ALREADY_IN_CHAIN') || message.includes('request_extra_approvers_request_employee_key')) {
    return { ok: false, status: 409, error: 'Seçilen kişilerden biri zaten onay zincirinde.' };
  }
  console.error('[extra-approvers] insert_extra_approvers_before failed:', error);
  return { ok: false, status: 500, error: 'Ek onaycılar eklenemedi' };
}
