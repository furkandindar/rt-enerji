// Vekalet (Approval Delegation) — sunucu tarafı yardımcıları. Faz B / B2.
//
// Yetki gerçeği DB'dedir: public.can_act_on_approval(approval_id) — RLS
// update politikası ve bekleyen onaylar view'ı da aynı fonksiyonu kullanır.
// Route'larda "approver_employee_id === ben" karşılaştırması YAPILMAZ; tek
// kaynak resolveActingRights()'tır. Böylece vekil, delegator'ın PENDING
// satırını vekalet penceresi içinde görür ve işler; satır taşınmaz.
//
// Tasarım/kararlar: docs/onay-havuzu-ve-vekalet-plan.md (Bölüm 5).

import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Karar 8: bu aşamada yalnız finans onay kapağı. Yeni süreç açmak = buraya kod ekle.
export const DELEGATION_ALLOWED_WORKFLOW_CODES = ['FINANCE_APPROVAL_COVER'] as const;
export type DelegationWorkflowCode = (typeof DELEGATION_ALLOWED_WORKFLOW_CODES)[number];

export function isDelegationAllowedWorkflow(
  code: string | null | undefined
): code is DelegationWorkflowCode {
  return !!code && (DELEGATION_ALLOWED_WORKFLOW_CODES as readonly string[]).includes(code);
}

export interface ActingRights {
  /** Bu satırda işlem yapabilir mi (kendisi VEYA aktif vekil) */
  canAct: boolean;
  /** Vekaleten mi işlem yapıyor (approver ≠ kendisi) */
  isDelegate: boolean;
  /** Vekaleten ise kimin adına (approver_employee_id) */
  onBehalfOfEmployeeId: string | null;
}

export const NO_ACTING_RIGHTS: ActingRights = {
  canAct: false,
  isDelegate: false,
  onBehalfOfEmployeeId: null,
};

/**
 * Oturumdaki kullanıcının bir onay satırındaki işlem yetkisi.
 * `supabase` KULLANICI bağlamlı client olmalı (RPC içinde auth.uid() okunur);
 * service-role ile çağrılırsa auth.uid() NULL → her zaman false döner.
 */
export async function resolveActingRights(
  supabase: SupabaseClient,
  approvalId: string,
  approverEmployeeId: string,
  currentEmployeeId: string
): Promise<ActingRights> {
  if (approverEmployeeId === currentEmployeeId) {
    return { canAct: true, isDelegate: false, onBehalfOfEmployeeId: null };
  }

  const { data, error } = await supabase.rpc('can_act_on_approval', {
    p_approval_id: approvalId,
  });

  if (error) {
    console.error('[delegation] can_act_on_approval rpc failed:', error);
    return NO_ACTING_RIGHTS;
  }

  return data === true
    ? { canAct: true, isDelegate: true, onBehalfOfEmployeeId: approverEmployeeId }
    : NO_ACTING_RIGHTS;
}

export interface ActiveDelegation {
  id: string;
  delegator_employee_id: string;
  delegate_employee_id: string;
  workflow_definition_id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Bir onaycının (delegator) verilen süreçte ŞU AN aktif vekaletleri.
 * Service-role: approval_delegations RLS'i yalnız taraflara açık; bildirim
 * fan-out'u talep eden / önceki onaycı bağlamında çalıştığı için gerekli.
 */
export async function getActiveDelegations(
  delegatorEmployeeId: string,
  workflowDefinitionId: string,
  at: Date = new Date()
): Promise<ActiveDelegation[]> {
  const admin = createServiceRoleClient();
  const iso = at.toISOString();
  const { data, error } = await admin
    .from('approval_delegations')
    .select('id, delegator_employee_id, delegate_employee_id, workflow_definition_id, starts_at, ends_at')
    .eq('delegator_employee_id', delegatorEmployeeId)
    .eq('workflow_definition_id', workflowDefinitionId)
    .eq('status', 'ACTIVE')
    .lte('starts_at', iso)
    .gt('ends_at', iso);

  if (error) {
    console.error('[delegation] getActiveDelegations failed:', error);
    return [];
  }
  return (data ?? []) as ActiveDelegation[];
}

/** Talebin onaycısı için aktif vekil employee id'leri (talebin süreci baz alınır). */
export async function getActiveDelegateIdsForRequest(
  delegatorEmployeeId: string,
  requestId: string
): Promise<string[]> {
  const admin = createServiceRoleClient();
  const { data: req } = await admin
    .from('requests')
    .select('workflow_definition_id')
    .eq('id', requestId)
    .maybeSingle();

  if (!req?.workflow_definition_id) return [];
  const rows = await getActiveDelegations(delegatorEmployeeId, req.workflow_definition_id);
  return rows.map((r) => r.delegate_employee_id);
}

/** "Ad Soyad" — bildirim/etiket metinleri için. */
export async function getEmployeeFullName(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('employees')
    .select('first_name, last_name')
    .eq('id', employeeId)
    .maybeSingle();
  if (!data) return null;
  return `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || null;
}

/** Vekaleten işlem eden kişinin görünen adı: "Ad Soyad (X adına vekaleten)". */
export function formatActingName(actorName: string, onBehalfOfName: string | null): string {
  return `${actorName} (${onBehalfOfName ?? 'onaycı'} adına vekaleten)`;
}

// ============================================================================
// API route'ları için ortak select + hesaplanan alan (route.ts dosyaları
// handler dışında export edemediği için burada)
// ============================================================================

export const DELEGATION_SELECT = `
  id,
  status,
  source,
  reason,
  starts_at,
  ends_at,
  created_at,
  cancelled_at,
  delegator_employee_id,
  delegate_employee_id,
  workflow_definition_id,
  created_by_user_id,
  delegator:employees!delegator_employee_id(id, first_name, last_name),
  delegate:employees!delegate_employee_id(id, first_name, last_name),
  workflow_definition:workflow_definitions(id, code, name)
`;

/** status=ACTIVE ve şu an tarih aralığı içinde mi */
export function withIsCurrent<T extends { status: string; starts_at: string; ends_at: string }>(
  row: T,
  now: Date = new Date()
): T & { is_current: boolean } {
  const s = new Date(row.starts_at).getTime();
  const e = new Date(row.ends_at).getTime();
  const t = now.getTime();
  return { ...row, is_current: row.status === 'ACTIVE' && s <= t && t < e };
}
