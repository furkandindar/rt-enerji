// Notification Service - V2
// Bildirim oluşturma ve yönetimi + Email gönderimi

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationType } from './types';
import { sendNotificationEmail } from '@/lib/email/email-service';

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
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Employee ID'den user ID ve email'i bulur
 */
async function getUserInfoByEmployeeId(
  supabase: SupabaseClient,
  employeeId: string
): Promise<UserInfo | null> {
  const { data } = await supabase
    .from('app_users')
    .select('id, email')
    .eq('employee_id', employeeId)
    .single();

  if (!data) return null;
  return { id: data.id, email: data.email };
}

/**
 * Employee ID'den user ID'yi bulur (backward compatibility)
 */
async function getUserIdByEmployeeId(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string | null> {
  const userInfo = await getUserInfoByEmployeeId(supabase, employeeId);
  return userInfo?.id || null;
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
 * Onaycıya "onay bekliyor" bildirimi gönderir + Email
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
  const message = `${requesterName} tarafından oluşturulan ${workflowName} talebi onayınızı bekliyor.${subjectLine}`;
  const type = 'APPROVAL_REQUIRED';

  // In-app bildirim oluştur
  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  // Email gönder
  if (userInfo.email) {
    await sendNotificationEmail({
      to: userInfo.email,
      title,
      message,
      type,
    });
  }
}

/**
 * Talep edene "onaylandı" bildirimi gönderir + Email
 */
export async function notifyRequestApproved(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  subject?: string
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, requesterEmployeeId);
  if (!userInfo) return;

  const title = 'Talep Onaylandı';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${workflowName} talebiniz onaylandı.${subjectLine}`;
  const type = 'REQUEST_APPROVED';

  // In-app bildirim oluştur
  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  // Email gönder
  if (userInfo.email) {
    await sendNotificationEmail({
      to: userInfo.email,
      title,
      message,
      type,
    });
  }
}

/**
 * Talep edene "reddedildi" bildirimi gönderir + Email
 */
export async function notifyRequestRejected(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  rejectedBy: string,
  subject?: string
): Promise<void> {
  const userInfo = await getUserInfoByEmployeeId(supabase, requesterEmployeeId);
  if (!userInfo) return;

  const title = 'Talep Reddedildi';
  const subjectLine = subject ? `\nKonu: ${subject}` : '';
  const message = `${workflowName} talebiniz ${rejectedBy} tarafından reddedildi.${subjectLine}`;
  const type = 'REQUEST_REJECTED';

  // In-app bildirim oluştur
  await createNotification(supabase, {
    userId: userInfo.id,
    title,
    message,
    type,
    referenceId: requestId,
  });

  // Email gönder
  if (userInfo.email) {
    await sendNotificationEmail({
      to: userInfo.email,
      title,
      message,
      type,
    });
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

