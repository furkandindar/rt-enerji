// Workflow tipine göre form-spesifik detay satırları üretir.
// buildRequestEmailContext içinden çağrılır.

import { SupabaseClient } from '@supabase/supabase-js';
import type { EmailDetailRow } from './email-service';
import { fmtDate, fmtDateTime, fmtMoney } from './request-summary';
import {
  leaveTypeLabels,
  overtimeTypeLabels,
  financeExpenseAreaLabels,
  financeFundingSourceLabels,
} from '@/lib/approvals/constants';

function pushIf(rows: EmailDetailRow[], label: string, value: string | null | undefined) {
  if (value && value.trim()) rows.push({ label, value: value.trim() });
}

export async function buildWorkflowDetails(
  supabase: SupabaseClient,
  requestId: string,
  workflowCode: string
): Promise<EmailDetailRow[]> {
  const rows: EmailDetailRow[] = [];

  switch (workflowCode) {
    case 'ANNUAL_LEAVE':
    case 'SHORT_LEAVE': {
      const { data } = await supabase
        .from('leave_requests')
        .select('leave_type, start_datetime, end_datetime, total_days, reason')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'İzin Türü', leaveTypeLabels[data.leave_type] || data.leave_type);
      const startStr = workflowCode === 'SHORT_LEAVE' ? fmtDateTime(data.start_datetime) : fmtDate(data.start_datetime);
      const endStr = workflowCode === 'SHORT_LEAVE' ? fmtDateTime(data.end_datetime) : fmtDate(data.end_datetime);
      if (startStr && endStr) pushIf(rows, 'Tarih Aralığı', `${startStr} – ${endStr}`);
      if (data.total_days != null) pushIf(rows, 'Toplam Gün', `${data.total_days}`);
      pushIf(rows, 'Sebep', data.reason);
      break;
    }

    case 'EXPENSE_FORM': {
      const { data } = await supabase
        .from('expense_requests')
        .select('project_name, project_code, is_travel, work_or_destination, travel_date, advance_amount, items:expense_items(amount, currency)')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Proje', [data.project_name, data.project_code].filter(Boolean).join(' / '));
      if (data.is_travel) pushIf(rows, 'Görev Yeri', data.work_or_destination);
      if (data.travel_date) pushIf(rows, 'Görev Tarihi', fmtDate(data.travel_date));
      const items = (data as { items?: Array<{ amount: number; currency: string }> }).items || [];
      const totals: Record<string, number> = {};
      items.forEach((it) => {
        const cur = it.currency || 'TRY';
        totals[cur] = (totals[cur] || 0) + Number(it.amount || 0);
      });
      const totalStr = Object.entries(totals).map(([cur, sum]) => fmtMoney(sum, cur)).filter(Boolean).join(' + ');
      pushIf(rows, 'Toplam Tutar', totalStr);
      pushIf(rows, 'Avans', fmtMoney(data.advance_amount));
      break;
    }

    case 'SALARY_ADVANCE': {
      const { data } = await supabase
        .from('salary_advance_requests')
        .select('amount, payment_method')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Tutar', fmtMoney(data.amount));
      pushIf(rows, 'Ödeme Yöntemi', data.payment_method);
      break;
    }

    case 'OVERTIME': {
      const { data } = await supabase
        .from('overtime_requests')
        .select('overtime_type, work_start_date, work_end_date, total_hours, work_location, reason_detail')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Mesai Türü', overtimeTypeLabels[data.overtime_type] || data.overtime_type);
      const startStr = fmtDateTime(data.work_start_date);
      const endStr = fmtDateTime(data.work_end_date);
      if (startStr && endStr) pushIf(rows, 'Çalışma Aralığı', `${startStr} – ${endStr}`);
      if (data.total_hours != null) pushIf(rows, 'Toplam Saat', `${data.total_hours} saat`);
      pushIf(rows, 'Çalışma Yeri', data.work_location);
      pushIf(rows, 'Gerekçe', data.reason_detail);
      break;
    }

    case 'TRAVEL_ASSIGNMENT': {
      const { data } = await supabase
        .from('travel_assignment_requests')
        .select('assignment_subject, destination_city, destination_institution, estimated_departure_at, estimated_return_at, transportation_type, advance_requested')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Konu', data.assignment_subject);
      pushIf(rows, 'Şehir', data.destination_city);
      pushIf(rows, 'Kurum', data.destination_institution);
      const dep = fmtDateTime(data.estimated_departure_at);
      const ret = fmtDateTime(data.estimated_return_at);
      if (dep && ret) pushIf(rows, 'Tahmini Gidiş–Dönüş', `${dep} – ${ret}`);
      pushIf(rows, 'Ulaşım', data.transportation_type);
      if (data.advance_requested) pushIf(rows, 'Avans', 'Talep edildi');
      break;
    }

    case 'STAMP_APPROVAL': {
      const { data } = await supabase
        .from('stamp_requests')
        .select('subject, description, selected_pages, stamp:stamps(name)')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Konu', data.subject);
      const stampName = (data as { stamp?: { name?: string } }).stamp?.name;
      pushIf(rows, 'Kaşe', stampName);
      pushIf(rows, 'Sayfalar', data.selected_pages);
      pushIf(rows, 'Açıklama', data.description);
      break;
    }

    case 'APPROVAL_LETTER': {
      const { data } = await supabase
        .from('approval_letter_requests')
        .select('letter_date, company, project, subject, requested_payment_amount')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Tarih', fmtDate(data.letter_date));
      pushIf(rows, 'Firma', data.company);
      pushIf(rows, 'Proje', data.project);
      pushIf(rows, 'Konu', data.subject);
      pushIf(rows, 'Talep Edilen Ödeme', data.requested_payment_amount);
      break;
    }

    case 'REQUEST_FORM': {
      const { data } = await supabase
        .from('request_form_requests')
        .select('subject, request_type, quantity, amount, reason')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Konu', data.subject);
      pushIf(rows, 'Tür', data.request_type);
      pushIf(rows, 'Miktar', data.quantity);
      pushIf(rows, 'Tutar', fmtMoney(data.amount));
      pushIf(rows, 'Gerekçe', data.reason);
      break;
    }

    case 'COMPARISON_FORM': {
      const { data } = await supabase
        .from('mukayese_requests')
        .select('project_title, company, subject, request_amount_text, form_date')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Proje', data.project_title);
      pushIf(rows, 'Firma', data.company);
      pushIf(rows, 'Konu', data.subject);
      pushIf(rows, 'Talep Tutarı', data.request_amount_text);
      pushIf(rows, 'Form Tarihi', fmtDate(data.form_date));
      break;
    }

    case 'ACCOUNTING_APPROVAL_COVER': {
      const { data } = await supabase
        .from('accounting_approval_cover_requests')
        .select('subject, request_date, document_no')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Konu', data.subject);
      pushIf(rows, 'Tarih', fmtDate(data.request_date));
      pushIf(rows, 'Belge No', data.document_no);
      break;
    }

    case 'FINANCE_APPROVAL_COVER': {
      const { data } = await supabase
        .from('finance_approval_cover_requests')
        .select('subject, request_date, document_no, expense_area, funding_source')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Konu', data.subject);
      pushIf(rows, 'Tarih', fmtDate(data.request_date));
      pushIf(rows, 'Belge No', data.document_no);
      pushIf(rows, 'Harcama Alanı', financeExpenseAreaLabels[data.expense_area] || data.expense_area);
      pushIf(rows, 'Finansman', financeFundingSourceLabels[data.funding_source] || data.funding_source);
      break;
    }

    case 'EMPLOYEE_ONBOARDING': {
      const { data } = await supabase
        .from('onboarding_requests')
        .select('employee_name, employee_title, department, location, start_date, reporting_manager')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Personel', data.employee_name);
      pushIf(rows, 'Ünvan', data.employee_title);
      pushIf(rows, 'Departman', data.department);
      pushIf(rows, 'Lokasyon', data.location);
      pushIf(rows, 'İşe Başlama', fmtDate(data.start_date));
      pushIf(rows, 'Bağlı Olduğu Yönetici', data.reporting_manager);
      break;
    }

    case 'EMPLOYEE_SEPARATION': {
      const { data } = await supabase
        .from('separation_requests')
        .select('employee_name, employee_title, department, separation_date, separation_reason')
        .eq('request_id', requestId)
        .single();
      if (!data) break;
      pushIf(rows, 'Personel', data.employee_name);
      pushIf(rows, 'Ünvan', data.employee_title);
      pushIf(rows, 'Departman', data.department);
      pushIf(rows, 'Çıkış Tarihi', fmtDate(data.separation_date));
      pushIf(rows, 'Çıkış Sebebi', data.separation_reason);
      break;
    }
  }

  return rows;
}
