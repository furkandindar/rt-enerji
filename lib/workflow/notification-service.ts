// Notification Service - V2
// Bildirim oluşturma ve yönetimi + Email gönderimi

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationType } from './types';
import { sendNotificationEmail, type SendNotificationEmailParams } from '@/lib/email/email-service';
import { buildRequestEmailContext } from '@/lib/email/request-summary';

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
  const userInfo = await getUserInfoByEmployeeId(supabase, approverEmployeeId);
  if (!userInfo) return;

  const title = 'Onay Bekleyen Talep';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${requesterName} tarafından oluşturulan ${workflowName} süreci onayınızı bekliyor.${subjectLine}`;
  const type = 'APPROVAL_REQUIRED';

  // In-app bildirim — kısa metin
  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  // Email — zengin payload (helper hata verirse minimal payload ile fallback)
  if (userInfo.email) {
    const payload = await enrichEmailPayload(
      supabase,
      requestId,
      { to: userInfo.email, title, message, type, ctaPath: '/approvals' },
      userInfo.fullName
    );
    await sendNotificationEmail(payload);
  }
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
      { to: userInfo.email, title, message, type, ctaPath: '/my-requests' },
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
      { to: userInfo.email, title, message, type, ctaPath: '/my-requests' },
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

