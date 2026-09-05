import React from 'react';
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer';
import { RequestPDFTemplate } from './request-pdf-template';
import { SalaryAdvancePDFTemplate } from './salary-advance-pdf-template';
import { OvertimePDFTemplate } from './overtime-pdf-template';
import { OnboardingPDFTemplate } from './onboarding-pdf-template';
import { SeparationPDFTemplate } from './separation-pdf-template';
import { RequestFormPDFTemplate } from './request-form-pdf-template';
import { TravelAssignmentPDFTemplate } from './travel-assignment-pdf-template';
import { ApprovalLetterPDFTemplate } from './approval-letter-pdf-template';
import { FinanceApprovalCoverPDFTemplate } from './finance-approval-cover-pdf-template';
import { AccountingApprovalCoverPDFTemplate } from './accounting-approval-cover-pdf-template';
import { ComparisonFormPDFTemplate } from './comparison-form-pdf-template';
import { ExpenseFormPDFTemplate } from './expense-form-pdf-template';
import { SupabaseClient } from '@supabase/supabase-js';
import { SignatureFont, DEFAULT_SIGNATURE_FONT } from '@/lib/signature/types';
import type { PdfApproval, SignatureInfo } from './types';

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
      onboarding_request:onboarding_requests(*),
      separation_request:separation_requests(*),
      request_form_request:request_form_requests(*),
      travel_assignment_request:travel_assignment_requests(*, company:companies(*)),
      approval_letter_request:approval_letter_requests(*),
      finance_approval_cover_request:finance_approval_cover_requests(
        *,
        items:finance_approval_cover_items(*)
      ),
      accounting_approval_cover_request:accounting_approval_cover_requests(
        *,
        items:accounting_approval_cover_items(*)
      ),
      mukayese_request:mukayese_requests(
        *,
        items:mukayese_items(*, prices:mukayese_prices(*)),
        suppliers:mukayese_suppliers(*)
      ),
      expense_request:expense_requests(
        *,
        items:expense_items(*)
      ),
      approvals:request_approvals(
        id,
        status,
        comment,
        decided_at,
        created_at,
        sequence_order,
        revision_cycle,
        workflow_step:workflow_steps(
          step_order,
          name,
          approver_type,
          form_section_key,
          phase,
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
        ),
        acted_by:employees!request_approvals_acted_by_employee_id_fkey(
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

  // COMPLETION fazındaki ykb_signed_pdf adımı için approver bilgisini override
  // et: bu adımda imzalı taranmış PDF'i sisteme yükleyen kişi (asistan) sadece
  // teknik vekildir; yazılı/üretilen PDF'te ilgili kolonun altında şirket
  // sahibinin adı görünmelidir. Pseudo bir id kullanarak signatures lookup'ının
  // başarısız olmasını ve "İmza" placeholder'ının kalmasını sağlıyoruz —
  // ıslak imza basılı PDF üzerinde alınacak.
  const FOUNDER_PSEUDO_ID = '__ykb_signed_pdf_founder__';
  // V5: PDF'te sadece aktif revize turunun approval'ları render edilmeli.
  // Eski cycle kayıtları audit için DB'de duruyor ama PDF'te görünmemeli.
  const activeCycle = ((request as { current_revision_cycle?: number }).current_revision_cycle) ?? 0;
  const approvals: PdfApproval[] = ((request.approvals || []) as Array<PdfApproval & { revision_cycle?: number }>)
    .filter((approval) => (approval.revision_cycle ?? 0) === activeCycle)
    .map((approval) => {
      const step = approval.workflow_step;
      if (step?.phase === 'COMPLETION' && step?.form_section_key === 'ykb_signed_pdf') {
        return {
          ...approval,
          approver: {
            ...approval.approver,
            id: FOUNDER_PSEUDO_ID,
            first_name: 'RAMAZAN',
            last_name: 'TAŞ',
            signature_text: null,
            signature_font: null,
          },
        };
      }
      return approval;
    });

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
  // Sadece APPROVED durumundaki adımlar için imza üret. REJECTED/PENDING
  // adımlarda imza yerine template'in placeholder'ı (veya "Reddedildi" yazısı)
  // görünmeli — aksi halde reddeden kişi imzalı görünür.
  //
  // Vekalet (Faz B, karar 3): onayı vekil verdiyse (acted_by ≠ approver) imza
  // VEKİLİN kendi imzasıdır; delegator'ın imza metni ASLA basılmaz (sahte imza).
  // Map yine approver.id ile anahtarlanır (şablonlar kolonu onaycıya göre bulur);
  // onBehalfNote şablonda imzanın altına "Vekaleten: <vekil>" etiketi olarak düşer.
  for (const approval of approvals) {
    if (approval.status !== 'APPROVED') continue;
    if (approval.approver.id === FOUNDER_PSEUDO_ID) continue;

    const actedBy = approval.acted_by;
    const isDelegated = !!actedBy && actedBy.id !== approval.approver.id;
    const signer = isDelegated && actedBy ? actedBy : approval.approver;
    const signerFullName =
      signer.first_name && signer.last_name ? `${signer.first_name} ${signer.last_name}` : null;
    const onBehalfNote = isDelegated && signerFullName ? `Vekaleten: ${signerFullName}` : undefined;

    if (signer.signature_text && signer.signature_font) {
      signatures[approval.approver.id] = {
        text: signer.signature_text,
        font: signer.signature_font as SignatureFont,
        onBehalfNote,
      };
    } else if (signerFullName) {
      // Fallback: İsim soyisim ile default font
      signatures[approval.approver.id] = {
        text: signerFullName,
        font: DEFAULT_SIGNATURE_FONT,
        onBehalfNote,
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
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.onboarding_request) {
    // İşe Giriş Takip Formu PDF'i
    pdfDocument = React.createElement(OnboardingPDFTemplate, {
      request,
      requester: request.requester,
      onboardingRequest: request.onboarding_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.separation_request) {
    // İşten Çıkış Takip Formu PDF'i
    pdfDocument = React.createElement(SeparationPDFTemplate, {
      request,
      requester: request.requester,
      separationRequest: request.separation_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.request_form_request) {
    // Talep Formu PDF'i
    pdfDocument = React.createElement(RequestFormPDFTemplate, {
      request,
      requester: request.requester,
      requestFormRequest: request.request_form_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.travel_assignment_request) {
    // Şehir İçi/Dışı Görev Formu PDF'i
    pdfDocument = React.createElement(TravelAssignmentPDFTemplate, {
      request,
      requester: request.requester,
      travelAssignmentRequest: request.travel_assignment_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.approval_letter_request) {
    // Olur Yazısı PDF'i
    pdfDocument = React.createElement(ApprovalLetterPDFTemplate, {
      request,
      requester: request.requester,
      approvalLetterRequest: request.approval_letter_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.finance_approval_cover_request) {
    // Onay Kapağı Finans PDF'i
    pdfDocument = React.createElement(FinanceApprovalCoverPDFTemplate, {
      financeRequest: request.finance_approval_cover_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.accounting_approval_cover_request) {
    // Onay Kapağı Muhasebe PDF'i
    pdfDocument = React.createElement(AccountingApprovalCoverPDFTemplate, {
      accountingRequest: request.accounting_approval_cover_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.mukayese_request) {
    // Mukayese Formu PDF'i (A3 landscape)
    // mukayese_prices, mukayese_items altında nested gelir; template top-level
    // mukayeseRequest.prices flat array'ini bekler.
    const m = request.mukayese_request as { items?: Array<{ prices?: unknown[] }>; prices?: unknown[] };
    if (m.items) m.prices = m.items.flatMap((it) => it.prices ?? []);
    pdfDocument = React.createElement(ComparisonFormPDFTemplate, {
      request,
      requester: request.requester,
      mukayeseRequest: request.mukayese_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.expense_request) {
    // Harcama Formu PDF'i
    pdfDocument = React.createElement(ExpenseFormPDFTemplate, {
      request,
      requester: request.requester,
      expenseRequest: request.expense_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else if (request.salary_advance_request) {
    // Maaş Avans PDF'i
    pdfDocument = React.createElement(SalaryAdvancePDFTemplate, {
      request,
      requester: request.requester,
      salaryAdvanceRequest: request.salary_advance_request,
      approvals,
      signatures,
    }) as React.ReactElement<DocumentProps>;
  } else {
    // İzin Talebi PDF'i (varsayılan)
    pdfDocument = React.createElement(RequestPDFTemplate, {
      request,
      requester: request.requester,
      leaveRequest: request.leave_request,
      approvals,
      workflowName: request.workflow_definition?.name || 'Talep',
      signatures,
    }) as React.ReactElement<DocumentProps>;
  }

  // PDF'i buffer'a render et
  const pdfBuffer = await renderToBuffer(pdfDocument);

  return Buffer.from(pdfBuffer);
}

