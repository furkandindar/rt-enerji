// Email Service - Resend ile email gönderimi
// https://resend.com/docs

import { Resend } from 'resend';

// Resend client - server-side only
const resend = new Resend(process.env.RESEND_API_KEY);

// Email gönderen adres (Resend'de doğrulanmış domain gerekir)
// Domain doğrulanmamışsa sadece RESEND_TEST_EMAIL'e gönderim yapılabilir
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'RT Enerji <onboarding@resend.dev>';

// Test modu: Domain doğrulanmamışsa sadece bu adrese gönder
const TEST_EMAIL = process.env.RESEND_TEST_EMAIL || null;

// Domain doğrulanmış mı?
const IS_DOMAIN_VERIFIED = !!process.env.RESEND_FROM_EMAIL;

// ============================================================================
// Types
// ============================================================================

export interface SendNotificationEmailParams {
  to: string;           // Alıcı email adresi
  title: string;        // Bildirim başlığı
  message: string;      // Bildirim mesajı
  type: string;         // Bildirim tipi (APPROVAL_REQUIRED, REQUEST_APPROVED, etc.)
  appUrl?: string;      // Uygulama URL'i (opsiyonel)
}

// ============================================================================
// Email Templates
// ============================================================================

function getEmailSubject(type: string, title: string): string {
  const prefixes: Record<string, string> = {
    APPROVAL_REQUIRED: '⏳ Onay Bekliyor',
    REQUEST_APPROVED: '✅ Onaylandı',
    REQUEST_REJECTED: '❌ Reddedildi',
    REQUEST_CANCELLED: '🚫 İptal Edildi',
    INFO: 'ℹ️ Bilgi',
  };
  
  return `${prefixes[type] || '📬'} ${title}`;
}

function getEmailHtml(params: SendNotificationEmailParams): string {
  const { title, message, type, appUrl } = params;
  
  const colors: Record<string, string> = {
    APPROVAL_REQUIRED: '#f59e0b', // yellow
    REQUEST_APPROVED: '#22c55e',  // green
    REQUEST_REJECTED: '#ef4444',  // red
    REQUEST_CANCELLED: '#6b7280', // gray
    INFO: '#3b82f6',              // blue
  };
  
  const color = colors[type] || '#6b7280';
  const actionUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: ${color}; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 20px;">${title}</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 30px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        ${message}
      </p>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin-top: 30px;">
        <a href="${actionUrl}/approvals" 
           style="display: inline-block; background: ${color}; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 500;">
          Uygulamada Görüntüle
        </a>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Bu email RT Enerji Yönetim Sistemi tarafından gönderilmiştir.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Bildirim emaili gönderir
 * @returns success: true/false ve error mesajı
 */
export async function sendNotificationEmail(
  params: SendNotificationEmailParams
): Promise<{ success: boolean; error?: string }> {
  // API key yoksa skip et
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  // Domain doğrulanmamışsa ve test email tanımlıysa, sadece test email'e gönder
  // Domain doğrulanmamış ve test email de yoksa, email gönderimini skip et
  let targetEmail = params.to;

  if (!IS_DOMAIN_VERIFIED) {
    if (TEST_EMAIL) {
      console.log(`[Email] Domain not verified. Redirecting email to test address: ${TEST_EMAIL}`);
      targetEmail = TEST_EMAIL;
    } else {
      console.log(`[Email] Domain not verified and no TEST_EMAIL set. Skipping email to: ${params.to}`);
      return { success: false, error: 'Domain not verified. Set RESEND_FROM_EMAIL or RESEND_TEST_EMAIL' };
    }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: targetEmail,
      subject: getEmailSubject(params.type, params.title),
      html: getEmailHtml(params),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log('Email sent successfully:', data?.id);
    return { success: true };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

