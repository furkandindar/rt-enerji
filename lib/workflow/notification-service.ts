// Notification Service - V2
// Bildirim oluşturma ve yönetimi + Email gönderimi

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationType } from './types';
import { sendNotificationEmail, type SendNotificationEmailParams } from '@/lib/email/email-service';
import { buildRequestEmailContext } from '@/lib/email/request-summary';
import { formatTrDateTime } from '@/lib/timezone';
import { getActiveDelegateIdsForRequest, getEmployeeFullName } from './delegation';

// ============================================================================
// Types
// ============================================================================

interface CreateNotificationParams {
  userId: string;  // app_users.id (auth user id)
  title: string;
  message: string;
  type: NotificationType;
  referenceId?: string;  // request_id veya başka bir referans
}

interface UserInfo {
  id: string;
  email: string | null;
  fullName: string | null;
}

export interface DecisionExtras {
  decidedByName?: string;
  decisionComment?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Employee ID'den user ID, email ve ad-soyad bilgisini bulur.
 */
async function getUserInfoByEmployeeId(
  supabase: SupabaseClient,
  employeeId: string
): Promise<UserInfo | null> {
  const { data } = await supabase
    .from('app_users')
    .select('id, email, employee:employees(first_name, last_name)')
    .eq('employee_id', employeeId)
    .single();

  if (!data) return null;
  const emp = (data as { employee?: { first_name?: string; last_name?: string } }).employee;
  const fullName = emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || null : null;
  return { id: data.id, email: data.email, fullName };
}

/**
 * Email payload'ını request bağlamından zenginleştirir.
 * Helper hata verirse minimal payload döner — email gönderimi engellenmemeli.
 */
async function enrichEmailPayload(
  supabase: SupabaseClient,
  requestId: string,
  base: SendNotificationEmailParams,
  recipientName: string | null,
  extras?: DecisionExtras
): Promise<SendNotificationEmailParams> {
  try {
    const ctx = await buildRequestEmailContext(supabase, requestId);
    if (!ctx) return base;
    return {
      ...base,
      recipientName: recipientName || undefined,
      requesterName: ctx.requesterName || undefined,
      requesterPosition: ctx.requesterPosition || undefined,
      workflowName: ctx.workflowName,
      workflowCode: ctx.workflowCode,
      requestId: ctx.requestId,
      submittedAt: ctx.submittedAt || undefined,
      details: ctx.details,
      currentStep: ctx.currentStep,
      totalSteps: ctx.totalSteps,
      nextApproverName: ctx.nextApproverName || undefined,
      decidedByName: extras?.decidedByName,
      decisionComment: extras?.decisionComment,
    };
  } catch (err) {
    console.error('[Email] enrichEmailPayload failed, sending minimal payload:', err);
    return base;
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Tek bir bildirim oluşturur
 */
export async function createNotification(
  supabase: SupabaseClient,
  params: CreateNotificationParams
): Promise<void> {
  // SECURITY DEFINER fonksiyon kullanarak bildirim oluştur
  // Bu fonksiyon RLS'i bypass eder (Next.js SSR + Supabase JWT token sorunu için)
  const { data, error } = await supabase.rpc('create_notification', {
    p_user_id: params.userId,
    p_title: params.title,
    p_message: params.message,
    p_type: params.type,
    p_reference_id: params.referenceId || null,
  });

  if (error) {
    console.error('Failed to create notification:', error);
  } else {
    console.log('Notification created with id:', data);
  }
}

/**
 * Onaycıya "onay bekliyor" bildirimi gönderir + zenginleştirilmiş email
 */
export async function notifyApprover(
  supabase: SupabaseClient,
  approverEmployeeId: string,
  requesterName: string,
  requestId: string,
  workflowName: string,
  subject?: string
): Promise<void> {
  const title = 'Onay Bekleyen Talep';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${requesterName} tarafından oluşturulan ${workflowName} süreci onayınızı bekliyor.${subjectLine}`;
  const type = 'APPROVAL_REQUIRED';

  // V5: Onaycının bu request'teki aktif PENDING approval id'sini bulup deep-link'e ekle.
  // Vekil için de aynı link geçerli: /approvals/[id] satırı RLS ile vekile açık.
  const ctaPath = await buildApproverCtaPath(supabase, approverEmployeeId, requestId, 'PENDING');

  const userInfo = await getUserInfoByEmployeeId(supabase, approverEmployeeId);
  if (userInfo) {
    // In-app bildirim — kısa metin
    await createNotification(supabase, {
      userId: userInfo.id,
      title,
      message,
      type,
      referenceId: requestId,
    });

    // Email — zengin payload (helper hata verirse minimal payload ile fallback).
    if (userInfo.email) {
      const payload = await enrichEmailPayload(
        supabase,
        requestId,
        { to: userInfo.email, title, message, type, ctaPath },
        userInfo.fullName
      );
      await sendNotificationEmail(payload);
    }
  }

  // Vekalet (Faz B): onaycının bu süreçte aktif vekili varsa aynı bildirim ona da
  // gider (onaycıya da gitmeye devam eder — döndüğünde görsün). Hata ana akışı
  // engellemesin.
  try {
    const delegateIds = await getActiveDelegateIdsForRequest(approverEmployeeId, requestId);
    if (delegateIds.length === 0) return;

    const approverName =
      userInfo?.fullName ?? (await getEmployeeFullName(supabase, approverEmployeeId));
    const onBehalf = approverName ? `${approverName} adına vekaleten` : 'vekaleten';
    const delegateMessage = `${requesterName} tarafından oluşturulan ${workflowName} süreci onayınızı bekliyor (${onBehalf}).${subjectLine}`;

    for (const delegateId of delegateIds) {
      const delegateInfo = await getUserInfoByEmployeeId(supabase, delegateId);
      if (!delegateInfo) continue;
      await createNotification(supabase, {
        userId: delegateInfo.id,
        title,
        message: delegateMessage,
        type,
        referenceId: requestId,
      });
      if (delegateInfo.email) {
        const payload = await enrichEmailPayload(
          supabase,
          requestId,
          { to: delegateInfo.email, title, message: delegateMessage, type, ctaPath },
          delegateInfo.fullName
        );
        await sendNotificationEmail(payload);
      }
    }
  } catch (err) {
    console.error('[notification] delegate fan-out failed:', err);
  }
}

/**
 * Onaycı için deep-link CTA path üretir.
 * Onaycının bu request'teki en güncel (aktif cycle) approval kaydını bulur ve
 * /approvals/[approvalId]'ye yönlendiren path döner. Bulamazsa /approvals listesine düşer.
 */
async function buildApproverCtaPath(
  supabase: SupabaseClient,
  approverEmployeeId: string,
  requestId: string,
  status: 'PENDING' | 'APPROVED'
): Promise<string> {
  try {
    const { data } = await supabase
      .from('request_approvals')
      .select('id')
      .eq('request_id', requestId)
      .eq('approver_employee_id', approverEmployeeId)
      .eq('status', status)
      .order('revision_cycle', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return `/approvals/${data.id}`;
  } catch (err) {
    console.error('[notification] buildApproverCtaPath failed:', err);
  }
  return '/approvals';
}

/**
 * Talep edene "onaylandı" bildirimi gönderir + zenginleştirilmiş email
 */
export async function notifyRequestApproved(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  subject?: string,
  extras?: DecisionExtras
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, requesterEmployeeId);
  if (!userInfo) return;

  const title = 'Talep Onaylandı';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${workflowName} talebiniz onaylandı.${subjectLine}`;
  const type = 'REQUEST_APPROVED';

  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  if (userInfo.email) {
    const payload = await enrichEmailPayload(
      supabase,
      requestId,
      { to: userInfo.email, title, message, type, ctaPath: `/my-requests/${requestId}` },
      userInfo.fullName,
      extras
    );
    await sendNotificationEmail(payload);
  }
}

/**
 * Talep edene "reddedildi" bildirimi gönderir + zenginleştirilmiş email
 */
export async function notifyRequestRejected(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  rejectedBy: string,
  subject?: string,
  extras?: DecisionExtras
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, requesterEmployeeId);
  if (!userInfo) return;

  const title = 'Talep Reddedildi';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${workflowName} talebiniz ${rejectedBy} tarafından reddedildi.${subjectLine}`;
  const type = 'REQUEST_REJECTED';

  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  if (userInfo.email) {
    // Reddeden kişi rejectedBy parametresi olarak zaten geliyor; extras override edebilir.
    const mergedExtras: DecisionExtras = {
      decidedByName: extras?.decidedByName || rejectedBy,
      decisionComment: extras?.decisionComment,
    };
    const payload = await enrichEmailPayload(
      supabase,
      requestId,
      { to: userInfo.email, title, message, type, ctaPath: `/my-requests/${requestId}` },
      userInfo.fullName,
      mergedExtras
    );
    await sendNotificationEmail(payload);
  }
}

/**
 * Kullanıcının okunmamış bildirim sayısını getirir
 */
export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return count || 0;
}

/**
 * V5: Talep güncellendiğinde, daha önce onaylamış onaycılara
 * "talep güncellendi" bildirimi gönderir.
 *
 * Resubmit sonrası eski cycle'da APPROVED veren onaycılara distinct olarak çağrılır
 * (talep edenin kendisi hariç).
 */
export async function notifyRequestUpdated(
  supabase: SupabaseClient,
  recipientEmployeeId: string,
  requestId: string,
  workflowName: string,
  updaterName: string,
  subject?: string
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, recipientEmployeeId);
  if (!userInfo) return;

  const title = 'Talep Güncellendi';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `Önceden onayladığınız ${workflowName} talebi ${updaterName} tarafından güncellendi ve onay zinciri yeniden başlatıldı.${subjectLine}`;
  const type: NotificationType = 'REQUEST_UPDATED';

  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  // V5: Bu kullanıcının request'teki en güncel APPROVED kaydına yönlendir
  // (genelde önceki cycle'da onay vermiş olduğu kayıt). Bulamazsa /approvals listesi.
  const ctaPath = await buildApproverCtaPath(supabase, recipientEmployeeId, requestId, 'APPROVED');
  if (userInfo.email) {
    const payload = await enrichEmailPayload(
      supabase,
      requestId,
      { to: userInfo.email, title, message, type, ctaPath },
      userInfo.fullName
    );
    await sendNotificationEmail(payload);
  }
}

/**
 * V5: Onaycı "revize iste" dediğinde talep edene
 * "düzeltmen gereken bir talep var" bildirimi gönderir.
 */
export async function notifyRevisionRequested(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  requestedByName: string,
  comment: string,
  subject?: string
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, requesterEmployeeId);
  if (!userInfo) return;

  const title = 'Revize İstendi';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${workflowName} talebiniz için ${requestedByName} revize istedi. "${comment}"${subjectLine}`;
  const type: NotificationType = 'REVISION_REQUESTED';

  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  if (userInfo.email) {
    const extras: DecisionExtras = {
      decidedByName: requestedByName,
      decisionComment: comment,
    };
    const payload = await enrichEmailPayload(
      supabase,
      requestId,
      { to: userInfo.email, title, message, type, ctaPath: `/my-requests/${requestId}` },
      userInfo.fullName,
      extras
    );
    await sendNotificationEmail(payload);
  }
}

// ============================================================================
// Vekalet (Faz B) bildirimleri
// ============================================================================

export interface DelegationAssignedInfo {
  delegateEmployeeId: string;
  delegatorEmployeeId: string;
  delegatorName: string;
  delegateName: string;
  workflowName: string;
  startsAt: string; // ISO (UTC)
  endsAt: string;   // ISO (UTC)
  reason?: string | null;
  /** Delegator'ın şu an sırası gelmiş bekleyen onay sayısı (vekile bilgi) */
  pendingCount?: number;
  /** Admin başkası adına tanımladıysa delegator'a da bilgi gider */
  createdByOther?: boolean;
}

/**
 * Vekil atandı: vekile (in-app + e-posta) ve — admin tanımladıysa — delegator'a.
 */
export async function notifyDelegationAssigned(
  supabase: SupabaseClient,
  info: DelegationAssignedInfo
): Promise<void> {
  const type: NotificationType = 'DELEGATION_ASSIGNED';
  const range = `${formatTrDateTime(info.startsAt)} – ${formatTrDateTime(info.endsAt)}`;

  const delegate = await getUserInfoByEmployeeId(supabase, info.delegateEmployeeId);
  if (delegate) {
    const pendingLine = info.pendingCount
      ? ` Şu an sırası gelmiş ${info.pendingCount} bekleyen onay var.`
      : '';
    const title = 'Vekil Olarak Tanımlandınız';
    const message = `${info.delegatorName} sizi ${range} tarihleri arasında "${info.workflowName}" süreci için vekil olarak tanımladı.${pendingLine}`;

    await createNotification(supabase, { userId: delegate.id, title, message, type });

    if (delegate.email) {
      await sendNotificationEmail({
        to: delegate.email,
        title,
        message,
        type,
        recipientName: delegate.fullName ?? undefined,
        details: [
          { label: 'Adına', value: info.delegatorName },
          { label: 'Süreç', value: info.workflowName },
          { label: 'Başlangıç', value: formatTrDateTime(info.startsAt) },
          { label: 'Bitiş', value: formatTrDateTime(info.endsAt) },
          ...(info.reason ? [{ label: 'Gerekçe', value: info.reason }] : []),
        ],
        ctaPath: '/approvals',
        ctaLabel: 'Bekleyen Onayları Gör',
      });
    }
  }

  if (info.createdByOther) {
    const delegator = await getUserInfoByEmployeeId(supabase, info.delegatorEmployeeId);
    if (delegator) {
      const title = 'Adınıza Vekalet Tanımlandı';
      const message = `${range} tarihleri arasında "${info.workflowName}" süreci için ${info.delegateName} adınıza vekil olarak tanımlandı.`;
      await createNotification(supabase, { userId: delegator.id, title, message, type });
      if (delegator.email) {
        await sendNotificationEmail({
          to: delegator.email,
          title,
          message,
          type,
          recipientName: delegator.fullName ?? undefined,
          ctaPath: '/profile',
          ctaLabel: 'Vekaletlerimi Gör',
        });
      }
    }
  }
}

export interface DelegationCancelledInfo {
  delegateEmployeeId: string;
  delegatorName: string;
  workflowName: string;
  /** true: iptal edildi; false: bitiş tarihi erkene çekildi */
  cancelled: boolean;
  newEndsAt?: string | null;
}

/** Vekalet iptal edildi / kısaltıldı: vekile bilgi. */
export async function notifyDelegationCancelled(
  supabase: SupabaseClient,
  info: DelegationCancelledInfo
): Promise<void> {
  const delegate = await getUserInfoByEmployeeId(supabase, info.delegateEmployeeId);
  if (!delegate) return;

  const type: NotificationType = 'DELEGATION_CANCELLED';
  const title = info.cancelled ? 'Vekalet İptal Edildi' : 'Vekalet Süresi Kısaltıldı';
  const message = info.cancelled
    ? `${info.delegatorName} adına "${info.workflowName}" süreci için tanımlı vekaletiniz iptal edildi.`
    : `${info.delegatorName} adına "${info.workflowName}" süreci için vekaletinizin bitişi ${formatTrDateTime(info.newEndsAt)} olarak güncellendi.`;

  await createNotification(supabase, { userId: delegate.id, title, message, type });

  if (delegate.email) {
    await sendNotificationEmail({
      to: delegate.email,
      title,
      message,
      type,
      recipientName: delegate.fullName ?? undefined,
      ctaPath: '/profile',
      ctaLabel: 'Vekaletlerimi Gör',
    });
  }
}
