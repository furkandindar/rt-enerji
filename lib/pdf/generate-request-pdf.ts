import React from 'react';
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer';
import { RequestPDFTemplate } from './request-pdf-template';
import { SalaryAdvancePDFTemplate } from './salary-advance-pdf-template';
import { OvertimePDFTemplate } from './overtime-pdf-template';
import { SupabaseClient } from '@supabase/supabase-js';
import { SignatureFont, DEFAULT_SIGNATURE_FONT } from '@/lib/signature/types';

interface GeneratePDFOptions {
  requestId: string;
  supabase: SupabaseClient;
}

// Font-based signature info
interface SignatureInfo {
  text: string;
  font: SignatureFont;
}

/**
 * Onaylanmış bir talep için PDF oluşturur
 * @param options - requestId ve supabase client
 * @returns PDF buffer
 */
export async function generateRequestPDF(
  options: GeneratePDFOptions
): Promise<Buffer> {
  const { requestId, supabase } = options;

  // Talep verilerini getir (imza bilgileri dahil)
  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select(`
      *,
      workflow_definition:workflow_definitions(id, code, name),
      requester:employees!requests_requester_employee_id_fkey(
        id,
        first_name,
        last_name,
        employee_no,
        signature_text,
        signature_font,
        employee_positions(
          position:positions(
            id,
            title
          ),
          is_primary,
          end_date
        )
      ),
      leave_request:leave_requests(*),
      salary_advance_request:salary_advance_requests(*),
      overtime_request:overtime_requests(
        *,
        entries:overtime_entries(*)
      ),
      approvals:request_approvals(
        id,
        status,
        comment,
        decided_at,
        created_at,
        workflow_step:workflow_steps(
          step_order,
          name,
          static_position:positions(
            id,
            title
          )
        ),
        approver:employees!request_approvals_approver_employee_id_fkey(
          id,
          first_name,
          last_name,
          signature_text,
          signature_font
        )
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    console.error('Error fetching request for PDF:', requestError);
    throw new Error(`Request not found: ${requestId}. Error: ${requestError?.message || 'Unknown error'}`);
  }

  // Font-based imzaları topla
  const signatures: Record<string, SignatureInfo> = {};

  // Talep sahibinin imzası
  if (request.requester.signature_text && request.requester.signature_font) {
    signatures[request.requester.id] = {
      text: request.requester.signature_text,
      font: request.requester.signature_font as SignatureFont,
    };
  } else if (request.requester.first_name && request.requester.last_name) {
    // Fallback: İsim soyisim ile default font
    signatures[request.requester.id] = {
      text: `${request.requester.first_name} ${request.requester.last_name}`,
      font: DEFAULT_SIGNATURE_FONT,
    };
  }

  // Onaylayanların imzaları
  for (const approval of request.approvals || []) {
    if (approval.approver.signature_text && approval.approver.signature_font) {
      signatures[approval.approver.id] = {
        text: approval.approver.signature_text,
        font: approval.approver.signature_font as SignatureFont,
      };
    } else if (approval.approver.first_name && approval.approver.last_name) {
      // Fallback: İsim soyisim ile default font
      signatures[approval.approver.id] = {
        text: `${approval.approver.first_name} ${approval.approver.last_name}`,
        font: DEFAULT_SIGNATURE_FONT,
      };
    }
  }

  // PDF template'i oluştur - workflow tipine göre farklı template kullan
  let pdfDocument: React.ReactElement<DocumentProps>;

  if (request.overtime_request) {
    // Fazla Mesai PDF'i
    pdfDocument = React.createElement(OvertimePDFTemplate, {
      request,
      requester: request.requester,
      overtimeRequest: request.overtime_request,
      entries: request.overtime_request.entries || [],
      approvals: request.approvals || [],
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.salary_advance_request) {
    // Maaş Avans PDF'i
    pdfDocument = React.createElement(SalaryAdvancePDFTemplate, {
      request,
      requester: request.requester,
      salaryAdvanceRequest: request.salary_advance_request,
      approvals: request.approvals || [],
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else {
    // İzin Talebi PDF'i (varsayılan)
    pdfDocument = React.createElement(RequestPDFTemplate, {
      request,
      requester: request.requester,
      leaveRequest: request.leave_request,
      approvals: request.approvals || [],
      workflowName: request.workflow_definition?.name || 'Talep',
      signatures,
    }) as React.ReactElement<DocumentProps>;
  }

  // PDF'i buffer'a render et
  const pdfBuffer = await renderToBuffer(pdfDocument);

  return Buffer.from(pdfBuffer);
}

