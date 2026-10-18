// Email zenginleştirme yardımcıları — workflow tipine göre form-spesifik özet
// üretir. notification-service.ts içinden tek noktadan çağrılır.

import { SupabaseClient } from '@supabase/supabase-js';
import type { EmailDetailRow, RevisionExchangeEmail } from './email-service';
import { buildWorkflowDetails } from './workflow-details';
import { APP_TZ } from '@/lib/timezone';
import { getApproverDisplayName, type Approval } from '@/lib/approvals/types';
import { findRevisionExchange } from '@/lib/workflow/revision-response';

// ============================================================================
// Types
// ============================================================================

export interface RequestEmailContext {
  workflowName: string;
  workflowCode: string;
  requestId: string;
  submittedAt: string | null;
  requesterName: string | null;
  requesterPosition: string | null;
  details: EmailDetailRow[];
  currentStep: number;
  totalSteps: number;
  nextApproverName: string | null;
  /** Aktif tur revize sonrası açıldıysa ve talep sahibi açıklama yazdıysa dolu. */
  revisionExchange: RevisionExchangeEmail | null;
}

// ============================================================================
// Formatters (paylaşımlı)
// ============================================================================

export function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: APP_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

export function fmtDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: APP_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function fmtMoney(amount?: number | string | null, currency = 'TRY'): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toLocaleString('tr-TR')} ${currency}`;
  }
}

// ============================================================================
// Ana fonksiyon
// ============================================================================

/**
 * Bir requestId verildiğinde email için zengin bağlam üretir.
 * Hata olursa minimum context döner (email gönderimi engellenmemeli).
 */
export async function buildRequestEmailContext(
  supabase: SupabaseClient,
  requestId: string
): Promise<RequestEmailContext | null> {
  // 1) Temel request + workflow + talep eden + onay zinciri
  const { data: req } = await supabase
    .from('requests')
    .select(`
      id, submitted_at, current_step, current_revision_cycle,
      workflow_definition:workflow_definitions(id, code, name),
      requester:employees!requests_requester_employee_id_fkey(
        first_name, last_name,
        employee_positions(
          is_primary, end_date,
          position:positions(title)
        )
      )
    `)
    .eq('id', requestId)
    .single();

  if (!req) return null;

  // Supabase tipleri 'unknown' dönebiliyor; runtime'da güvenli erişim
  const wfDef = (req as { workflow_definition?: { code?: string; name?: string } }).workflow_definition;
  const requester = (req as {
    requester?: {
      first_name?: string;
      last_name?: string;
      employee_positions?: Array<{
        is_primary: boolean;
        end_date: string | null;
        position?: { title?: string } | null;
      }>;
    };
  }).requester;

  const workflowCode = wfDef?.code || '';
  const workflowName = wfDef?.name || 'Talep';

  const requesterName = requester
    ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim() || null
    : null;

  const primaryPosition = requester?.employee_positions?.find(
    (ep) => ep.is_primary && !ep.end_date
  );
  const requesterPosition = primaryPosition?.position?.title || null;

  // 2) Onay zinciri (adım sayıları, sıradaki onaycı)
  // V5: Adım/sıradaki hesabı yalnız aktif cycle'dan. Aktif cycle revize sonrası
  // açıldıysa önceki cycle da okunur — yalnız revize yazışması (revize notu) için.
  const activeCycle = (req as { current_revision_cycle?: number }).current_revision_cycle ?? 0;
  const cycles = activeCycle > 0 ? [activeCycle - 1, activeCycle] : [activeCycle];
  const { data: approvalRows } = await supabase
    .from('request_approvals')
    .select(`
      sequence_order, status, comment, decided_at, revision_cycle,
      workflow_step:workflow_steps(step_order, name, approver_type, phase, form_section_key),
      approver:employees!request_approvals_approver_employee_id_fkey(id, first_name, last_name),
      acted_by:employees!acted_by_employee_id(id, first_name, last_name)
    `)
    .eq('request_id', requestId)
    .in('revision_cycle', cycles)
    .order('sequence_order', { ascending: true });

  const allRows = (approvalRows ?? []) as unknown as Approval[];
  const approvals = allRows.filter((a) => (a.revision_cycle ?? 0) === activeCycle);

  const totalSteps = approvals.length;
  const currentStep = (req as { current_step?: number }).current_step || 1;

  const next = approvals.find(
    (a) => a.sequence_order === currentStep && a.status === 'PENDING'
  );

  const nextApproverName = next?.approver
    ? `${next.approver.first_name || ''} ${next.approver.last_name || ''}`.trim() || null
    : null;

  // 2b) Revize yazışması: talep sahibi bu turda Revize Açıklaması yazdıysa.
  // Ayrı try: bu blok hata verirse yalnız yazışma düşer, e-postanın geri kalanı zengin kalır.
  let revisionExchange: RevisionExchangeEmail | null = null;
  try {
    const exchange = findRevisionExchange(allRows, activeCycle);
    if (exchange.response?.comment) {
      revisionExchange = {
        requestedByName: exchange.revision ? getApproverDisplayName(exchange.revision) : null,
        requestNote: exchange.revision?.comment ?? null,
        responseByName: getApproverDisplayName(exchange.response),
        responseNote: exchange.response.comment,
      };
    }
  } catch (err) {
    console.error('[Email] revision exchange build failed:', err);
  }

  // 3) Workflow özeti (form-spesifik)
  const details = await buildWorkflowDetails(supabase, requestId, workflowCode);

  return {
    workflowName,
    workflowCode,
    requestId,
    submittedAt: (req as { submitted_at?: string | null }).submitted_at || null,
    requesterName,
    requesterPosition,
    details,
    currentStep,
    totalSteps,
    nextApproverName,
    revisionExchange,
  };
}
