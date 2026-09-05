// Email Service - Microsoft Graph API ile email gönderimi
// https://learn.microsoft.com/en-us/graph/api/user-sendmail

import { graphAppFetch } from '@/lib/msgraph/app-client';
import { APP_TZ } from '@/lib/timezone';

// ============================================================================
// Config
// ============================================================================

const MAIL_FROM = process.env.AZURE_MAIL_FROM; // ör: deneme.admin@rtenerji.com

// ============================================================================
// Types
// ============================================================================

export interface EmailDetailRow {
  label: string;
  value: string;
}

export interface SendNotificationEmailParams {
  to: string;
  title: string;
  message: string;
  type: string;
  appUrl?: string;

  // Zengin (opsiyonel) alanlar — verilirse şablon detaylı render edilir
  recipientName?: string;
  requesterName?: string;
  requesterPosition?: string;
  workflowName?: string;
  workflowCode?: string;
  requestId?: string;
  submittedAt?: string;            // ISO; locale-dönüşümü template içinde
  details?: EmailDetailRow[];      // Form-spesifik özet
  currentStep?: number;
  totalSteps?: number;
  nextApproverName?: string;
  decidedByName?: string;
  decisionComment?: string;
  ctaPath?: string;                // Örn: '/approvals' veya '/my-requests'
  ctaLabel?: string;
}

// ============================================================================
// Email Templates
// ============================================================================

const TYPE_COLORS: Record<string, string> = {
  APPROVAL_REQUIRED: '#f59e0b',
  REQUEST_APPROVED: '#22c55e',
  REQUEST_REJECTED: '#ef4444',
  REQUEST_CANCELLED: '#6b7280',
  INFO: '#3b82f6',
  DELEGATION_ASSIGNED: '#8b5cf6',
  DELEGATION_CANCELLED: '#6b7280',
};

const TYPE_PREFIXES: Record<string, string> = {
  APPROVAL_REQUIRED: '⏳ Onay Bekliyor',
  REQUEST_APPROVED: '✅ Onaylandı',
  REQUEST_REJECTED: '❌ Reddedildi',
  REQUEST_CANCELLED: '🚫 İptal Edildi',
  INFO: 'ℹ️ Bilgi',
  DELEGATION_ASSIGNED: '🤝 Vekalet',
  DELEGATION_CANCELLED: '🚫 Vekalet Sona Erdi',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(iso?: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: APP_TZ,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return null;
  }
}

function getEmailSubject(params: SendNotificationEmailParams): string {
  const prefix = TYPE_PREFIXES[params.type] || '📬';
  const parts: string[] = [];
  if (params.workflowName) parts.push(params.workflowName);
  if (params.requesterName) parts.push(params.requesterName);
  const tail = parts.length > 0 ? parts.join(' – ') : params.title;
  return `${prefix} • ${tail}`;
}

function renderDetailsTable(rows: EmailDetailRow[]): string {
  if (!rows || rows.length === 0) return '';
  const body = rows.map(r => `
    <tr>
      <td style="padding: 8px 12px; color: #6b7280; font-size: 13px; border-bottom: 1px solid #f3f4f6; width: 40%; vertical-align: top;">${escapeHtml(r.label)}</td>
      <td style="padding: 8px 12px; color: #111827; font-size: 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">${escapeHtml(r.value)}</td>
    </tr>
  `).join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
      ${body}
    </table>
  `;
}

function renderCommentBox(comment: string, color: string, label: string): string {
  return `
    <div style="margin: 20px 0; padding: 14px 16px; background: #f9fafb; border-left: 4px solid ${color}; border-radius: 4px;">
      <div style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">${escapeHtml(label)}</div>
      <div style="color: #111827; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(comment)}</div>
    </div>
  `;
}

function getEmailHtml(params: SendNotificationEmailParams): string {
  const {
    title, message, type, appUrl,
    recipientName, requesterName, requesterPosition,
    workflowName, requestId, submittedAt,
    details, currentStep, totalSteps, nextApproverName,
    decidedByName, decisionComment,
    ctaPath, ctaLabel,
  } = params;

  const color = TYPE_COLORS[type] || '#6b7280';
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const path = ctaPath || (type === 'APPROVAL_REQUIRED' ? '/approvals' : '/my-requests');
  const cta = ctaLabel || (type === 'APPROVAL_REQUIRED' ? 'Talebi İncele ve Onayla' : 'Uygulamada Görüntüle');
  const actionUrl = `${baseUrl}${path}`;

  // Üst meta tablosu (form-spesifik details'tan ayrı; her zaman görünür sürec verisi)
  const metaRows: EmailDetailRow[] = [];
  if (workflowName) metaRows.push({ label: 'Süreç', value: workflowName });
  if (requesterName) {
    const reqLabel = requesterPosition ? `${requesterName} (${requesterPosition})` : requesterName;
    metaRows.push({ label: 'Talep Eden', value: reqLabel });
  }
  if (decidedByName) {
    metaRows.push({
      label: type === 'REQUEST_REJECTED' ? 'Reddeden' : 'Onaylayan',
      value: decidedByName,
    });
  }
  const submittedFormatted = formatDateTime(submittedAt);
  if (submittedFormatted) metaRows.push({ label: 'Gönderim', value: submittedFormatted });
  if (requestId) metaRows.push({ label: 'Talep No', value: requestId.slice(0, 8).toUpperCase() });

  // Onay zinciri durumu satırı
  let stepLine = '';
  if (typeof currentStep === 'number' && typeof totalSteps === 'number' && totalSteps > 0) {
    const next = nextApproverName ? ` — Sıradaki: <strong>${escapeHtml(nextApproverName)}</strong>` : '';
    stepLine = `
      <div style="margin: 16px 0; padding: 10px 14px; background: #f3f4f6; border-radius: 6px; color: #374151; font-size: 13px;">
        Onay durumu: <strong>Adım ${currentStep}/${totalSteps}</strong>${next}
      </div>
    `;
  }

  const greeting = recipientName ? `<p style="margin: 0 0 12px; color: #111827; font-size: 16px;">Sayın <strong>${escapeHtml(recipientName)}</strong>,</p>` : '';
  const commentBlock = decisionComment
    ? renderCommentBox(decisionComment, color, type === 'REQUEST_REJECTED' ? 'Red Gerekçesi' : 'Onaycı Notu')
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${color}; padding: 20px 24px;">
      <h1 style="color: white; margin: 0; font-size: 18px; font-weight: 600;">${escapeHtml(title)}</h1>
    </div>

    <div style="padding: 24px 28px;">
      ${greeting}
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(message)}</p>

      ${renderDetailsTable(metaRows)}

      ${details && details.length > 0 ? `
        <div style="margin-top: 20px; color: #111827; font-size: 14px; font-weight: 600;">Talep Detayları</div>
        ${renderDetailsTable(details)}
      ` : ''}

      ${stepLine}
      ${commentBlock}

      <div style="text-align: center; margin-top: 28px;">
        <a href="${actionUrl}"
           style="display: inline-block; background: ${color}; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 500; font-size: 14px;">
          ${escapeHtml(cta)}
        </a>
      </div>
    </div>

    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        Bu email RT Enerji Yönetim Sistemi tarafından otomatik gönderilmiştir.
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
 * Microsoft Graph API ile bildirim emaili gönderir
 * @returns success: true/false ve error mesajı
 */
export async function sendNotificationEmail(
  params: SendNotificationEmailParams
): Promise<{ success: boolean; error?: string }> {
  if (!MAIL_FROM) {
    console.warn('[Email] AZURE_MAIL_FROM eksik, email gönderilmiyor');
    return { success: false, error: 'AZURE_MAIL_FROM environment variable is not set' };
  }

  try {
    const emailPayload = {
      message: {
        subject: getEmailSubject(params),
        body: {
          contentType: 'HTML',
          content: getEmailHtml(params),
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to,
            },
          },
        ],
      },
      saveToSentItems: false,
    };

    const response = await graphAppFetch(`/users/${MAIL_FROM}/sendMail`, {
      method: 'POST',
      body: emailPayload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Email] Graph API error:', response.status, errorText);
      return { success: false, error: `Graph API error: ${response.status} ${errorText}` };
    }

    console.log(`[Email] Sent successfully to ${params.to} from ${MAIL_FROM}`);
    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

