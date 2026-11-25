// @mention — sunucu tarafı: aday listesi, anma kaydı ve bildirim.
//
// Kurallar (kullanıcı kararı 2026-10-18; görünürlük daraltması 2026-11-25):
//  - Anılabilecekler = aktif ve sistem hesabı bağlı çalışanlardan:
//      * kısıtsız süreçte HERKES — anma = paylaşım: anılan kişi talebin başlığını,
//        onay zincirini ve notlarını görür (RLS private.rls_mentioned_request_ids);
//        form içeriği, ekler ve PDF görmez. Kısıtsız süreç talepleri 2026-11-25'ten
//        beri üyelere toplu açık değil (sql/security_request_visibility_scope.sql);
//        anma bu yüzden erişimi kendisi verir.
//      * kısıtlı süreçte yalnız talebi ZATEN görebilenler (anma erişim vermez).
//    Görünürlük DB: employees_who_can_view_request (requests_select'in karşılığı).
//  - Kapsam: onay / red / revize notu (DECISION) + Revize Açıklaması (REVISION_RESPONSE).
//  - Bildirim yalnız listeden seçilip notta "@Ad Soyad" olarak görünen kişilere;
//    kendini anma ve aynı aksiyonda notu içeren asıl bildirimi zaten alanlar hariç.
//  - Kayıt request_mentions'ta (idempotent: aynı not + kişi bir kez).
//
// Anma işlemi kararın/gönderimin parçası DEĞİLDİR: yanıt döndükten sonra (after)
// çalışır, her hatası yutulup loglanır — anma altyapısı karar akışını asla bozmaz.
// Sunucu-only (service role).

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listApproverCandidates, type ApproverCandidate } from './extra-approvers';
import { notifyMentioned } from './notification-service';
import { noteContainsMention, type MentionSource } from './mentions-shared';

function createMentionClient(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient;
}

/** Talebi görebilen çalışanların id'leri (verilirse yalnız employeeIds arasından). */
async function getViewerIds(
  client: SupabaseClient,
  requestId: string,
  employeeIds?: string[]
): Promise<Set<string>> {
  const { data, error } = await client.rpc('employees_who_can_view_request', {
    p_request_id: requestId,
    p_employee_ids: employeeIds ?? null,
  });
  if (error) throw new Error(`employees_who_can_view_request failed: ${error.message}`);
  return new Set(((data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id));
}

/**
 * Talep kısıtsız bir süreçte mi? Yalnız orada anma paylaşımdır (anılan kişi talebi
 * görmeye başlar — RLS private.rls_mentioned_request_ids aynı koşulu kullanır).
 */
async function isUnrestrictedRequest(client: SupabaseClient, requestId: string): Promise<boolean> {
  const { data, error } = await client
    .from('requests')
    .select('workflow_definition:workflow_definitions!inner(is_restricted)')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new Error(`request workflow lookup failed: ${error.message}`);
  const wd = (data as { workflow_definition?: { is_restricted: boolean } | { is_restricted: boolean }[] } | null)
    ?.workflow_definition;
  const def = Array.isArray(wd) ? wd[0] : wd;
  return def ? !def.is_restricted : false;
}

/**
 * Anılabilecek çalışanlar: null = kısıtsız süreç, aktif + hesabı bağlı herkes;
 * aksi halde yalnız talebi zaten görebilenler.
 */
async function getMentionableIds(
  client: SupabaseClient,
  requestId: string,
  employeeIds?: string[]
): Promise<Set<string> | null> {
  if (await isUnrestrictedRequest(client, requestId)) return null;
  return getViewerIds(client, requestId, employeeIds);
}

/** Anma adayları: aktif + sistem hesabı bağlı + anılabilir (kendisi hariç). */
export async function listMentionCandidates(
  requestId: string,
  excludeEmployeeId?: string
): Promise<ApproverCandidate[]> {
  const client = createMentionClient();
  const [candidates, mentionable] = await Promise.all([
    listApproverCandidates(client),
    getMentionableIds(client, requestId),
  ]);
  return candidates.filter((c) => (!mentionable || mentionable.has(c.id)) && c.id !== excludeEmployeeId);
}

export interface ProcessMentionsParams {
  requestId: string;
  /** Notun bulunduğu request_approvals satırı */
  approvalId: string;
  source: MentionSource;
  note: string;
  mentionedEmployeeIds: string[];
  /** Notu yazan (vekaletse fiilen işlem yapan) */
  actorEmployeeId: string;
  /** Bildirimde görünen ad (vekaletse "X (Y adına vekaleten)") */
  actorName: string;
  workflowName: string;
  contextLabel: string;
  /** Bu aksiyonda notu içeren asıl bildirimi zaten alanlar — ayrıca bildirilmez. */
  alreadyNotifiedEmployeeIds?: string[];
}

export async function processMentions(p: ProcessMentionsParams): Promise<void> {
  const ids = p.mentionedEmployeeIds.filter((id) => id !== p.actorEmployeeId);
  if (ids.length === 0 || !p.note.trim()) return;

  const client = createMentionClient();

  // 1. Uygunluk — istemciye güvenilmez: anılabilir (kısıtsız süreçte herkes, kısıtlıda
  //    talebi görebilen) + aktif + hesabı bağlı + "@Ad Soyad" notta görünüyor.
  const [mentionable, employeesRes, usersRes] = await Promise.all([
    getMentionableIds(client, p.requestId, ids),
    client.from('employees').select('id, first_name, last_name, status').in('id', ids),
    client.from('app_users').select('employee_id').in('employee_id', ids),
  ]);
  if (employeesRes.error || usersRes.error) {
    throw new Error(
      `mention eligibility lookup failed: ${employeesRes.error?.message ?? usersRes.error?.message}`
    );
  }
  const linked = new Set(
    ((usersRes.data ?? []) as Array<{ employee_id: string | null }>).map((u) => u.employee_id)
  );
  const eligible = (
    (employeesRes.data ?? []) as Array<{ id: string; first_name: string; last_name: string; status: string }>
  ).filter(
    (e) =>
      e.status === 'ACTIVE' &&
      linked.has(e.id) &&
      (!mentionable || mentionable.has(e.id)) &&
      noteContainsMention(p.note, e.first_name, e.last_name)
  );
  if (eligible.length < ids.length) {
    console.warn(
      `[mentions] ${ids.length - eligible.length} mention(s) dropped as ineligible`,
      { requestId: p.requestId, approvalId: p.approvalId }
    );
  }
  if (eligible.length === 0) return;

  // 2. Kayıt — aynı not + kişi için tekrar denemede yeni satır oluşmaz, bildirim tekrarlanmaz.
  const { data: inserted, error: insertError } = await client
    .from('request_mentions')
    .upsert(
      eligible.map((e) => ({
        request_id: p.requestId,
        approval_id: p.approvalId,
        source: p.source,
        mentioned_employee_id: e.id,
        mentioned_by_employee_id: p.actorEmployeeId,
      })),
      { onConflict: 'approval_id,mentioned_employee_id', ignoreDuplicates: true }
    )
    .select('id, mentioned_employee_id');
  if (insertError) throw new Error(`request_mentions insert failed: ${insertError.message}`);

  // 3. Bildirim — kişi başına bağımsız; biri başarısız olsa diğerleri gider.
  const alreadyNotified = new Set(p.alreadyNotifiedEmployeeIds ?? []);
  for (const row of (inserted ?? []) as Array<{ id: string; mentioned_employee_id: string }>) {
    try {
      let via: 'MENTION' | 'ACTION';
      if (alreadyNotified.has(row.mentioned_employee_id)) {
        via = 'ACTION';
      } else {
        const delivered = await notifyMentioned(client, {
          mentionedEmployeeId: row.mentioned_employee_id,
          requestId: p.requestId,
          workflowName: p.workflowName,
          mentionedByName: p.actorName,
          note: p.note,
          contextLabel: p.contextLabel,
        });
        if (!delivered) continue; // notified_at NULL kalır → denetimde görünür
        via = 'MENTION';
      }
      const { error: markError } = await client
        .from('request_mentions')
        .update({ notified_at: new Date().toISOString(), notified_via: via })
        .eq('id', row.id);
      if (markError) console.error('[mentions] notified_at update failed:', markError);
    } catch (err) {
      console.error('[mentions] notify failed:', { mentionId: row.id, err });
    }
  }
}

/**
 * Route'lar için: anmaları yanıt döndükten sonra işler. Karar/gönderim zaten
 * kaydedilmiştir; buradaki hiçbir hata kullanıcıya yansımaz (loglanır).
 */
export function scheduleMentions(p: ProcessMentionsParams): void {
  if (p.mentionedEmployeeIds.length === 0) return;
  after(async () => {
    try {
      await processMentions(p);
    } catch (err) {
      console.error('[mentions] processing failed:', { requestId: p.requestId, err });
    }
  });
}
