// Notification Service - V2
// Bildirim oluşturma ve yönetimi

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationType } from './types';

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Employee ID'den user ID'yi bulur
 */
async function getUserIdByEmployeeId(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('app_users')
    .select('id')
    .eq('employee_id', employeeId)
    .single();

  return data?.id || null;
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
 * Onaycıya "onay bekliyor" bildirimi gönderir
 */
export async function notifyApprover(
  supabase: SupabaseClient,
  approverEmployeeId: string,
  requesterName: string,
  requestId: string,
  workflowName: string
): Promise<void> {
  const userId = await getUserIdByEmployeeId(supabase, approverEmployeeId);
  if (!userId) return;

  await createNotification(supabase, {
    userId,
    title: 'Onay Bekleyen Talep',
    message: `${requesterName} tarafından oluşturulan ${workflowName} talebiniz onayınızı bekliyor.`,
    type: 'APPROVAL_REQUIRED',
    referenceId: requestId,
  });
}

/**
 * Talep edene "onaylandı" bildirimi gönderir
 */
export async function notifyRequestApproved(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string
): Promise<void> {
  const userId = await getUserIdByEmployeeId(supabase, requesterEmployeeId);
  if (!userId) return;

  await createNotification(supabase, {
    userId,
    title: 'Talep Onaylandı',
    message: `${workflowName} talebiniz onaylandı.`,
    type: 'REQUEST_APPROVED',
    referenceId: requestId,
  });
}

/**
 * Talep edene "reddedildi" bildirimi gönderir
 */
export async function notifyRequestRejected(
  supabase: SupabaseClient,
  requesterEmployeeId: string,
  requestId: string,
  workflowName: string,
  rejectedBy: string
): Promise<void> {
  const userId = await getUserIdByEmployeeId(supabase, requesterEmployeeId);
  if (!userId) return;

  await createNotification(supabase, {
    userId,
    title: 'Talep Reddedildi',
    message: `${workflowName} talebiniz ${rejectedBy} tarafından reddedildi.`,
    type: 'REQUEST_REJECTED',
    referenceId: requestId,
  });
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

