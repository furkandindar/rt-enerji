import React from 'react';
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer';
import { RequestPDFTemplate } from './request-pdf-template';
import { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface GeneratePDFOptions {
  requestId: string;
  supabase: SupabaseClient;
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

  // Talep verilerini getir
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
          last_name
        )
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    console.error('Error fetching request for PDF:', requestError);
    throw new Error(`Request not found: ${requestId}. Error: ${requestError?.message || 'Unknown error'}`);
  }

  // İmzaları yükle - Service role client ile (RLS bypass)
  const signatures: Record<string, string> = {};
  const supabaseAdmin = createServiceRoleClient();

  // Yardımcı fonksiyon: İmza buffer'ı al
  const getSignatureBuffer = async (employeeId: string): Promise<Buffer | null> => {
    const fileName = `${employeeId}.png`;
    const { data, error } = await supabaseAdmin.storage
      .from('signatures')
      .download(fileName);

    if (error || !data) {
      console.log(`No signature found for employee ${employeeId}`);
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  // Talep sahibinin imzası
  try {
    const requesterSignature = await getSignatureBuffer(request.requester.id);
    if (requesterSignature) {
      signatures[request.requester.id] = `data:image/png;base64,${requesterSignature.toString('base64')}`;
    }
  } catch (error) {
    console.log('No signature for requester:', request.requester.id);
  }

  // Onaylayanların imzaları
  for (const approval of request.approvals || []) {
    try {
      const approverSignature = await getSignatureBuffer(approval.approver.id);
      if (approverSignature) {
        signatures[approval.approver.id] = `data:image/png;base64,${approverSignature.toString('base64')}`;
      }
    } catch (error) {
      console.log('No signature for approver:', approval.approver.id);
    }
  }

  // PDF template'i oluştur
  const pdfDocument = React.createElement(RequestPDFTemplate, {
    request,
    requester: request.requester,
    leaveRequest: request.leave_request,
    approvals: request.approvals || [],
    workflowName: request.workflow_definition?.name || 'Talep',
    signatures,
  });

  // PDF'i buffer'a render et
  const pdfBuffer = await renderToBuffer(pdfDocument as React.ReactElement<DocumentProps>);

  return Buffer.from(pdfBuffer);
}

