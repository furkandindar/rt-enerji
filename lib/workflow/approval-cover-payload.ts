// Onay Kapağı (Finans / Muhasebe) — validasyon ve DB satırı kurma.
// POST (yeni talep) ve PATCH (revize sonrası düzenleme) aynı kuralları
// buradan uygular; route dosyaları yalnız HTTP handler export edebildiği için
// ortak mantık burada durur.

import type {
  CreateAccountingApprovalCoverInput,
  CreateFinanceApprovalCoverInput,
} from './types';

const EXPENSE_AREAS = ['ANA_SAHA', 'ELEKTRIKSEL_KAPASITE_ARTISI', 'YEKA_1', 'YEKA_2'] as const;
const FUNDING_SOURCES = ['KREDI', 'OZ_KAYNAK', 'NAKIT_FAZLASI', 'DIGER'] as const;
const CAPACITY_TYPES = ['KAPASITE', 'ANASAHA', 'YEKA'] as const;
const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

type CoverItemInput = {
  item_date?: string;
  company_name?: string;
  payee_name?: string;
  item_subject?: string;
  invoice_amount?: unknown;
  payable_amount?: unknown;
  currency?: string;
  capacity_type?: string;
};

function validateHeader(body: { subject?: string; document_no?: string; request_date?: string }): string | null {
  if (!body.subject?.trim()) return "Konu gerekli";
  if (!body.document_no?.trim()) return "Sayı gerekli";
  if (!body.request_date) return "Tarih gerekli";
  return null;
}

function validateItems(items: unknown, withCapacityType: boolean): string | null {
  if (!Array.isArray(items) || items.length === 0) return "En az bir ödeme satırı zorunludur";
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as CoverItemInput;
    const row = `Satır ${i + 1}`;
    if (!it.item_date) return `${row}: tarih gerekli`;
    if (!it.company_name?.trim()) return `${row}: firma adı gerekli`;
    if (!it.payee_name?.trim()) return `${row}: ödeme yapılacak firma/kurum gerekli`;
    if (!it.item_subject?.trim()) return `${row}: konu gerekli`;
    if (withCapacityType && !CAPACITY_TYPES.includes(it.capacity_type as (typeof CAPACITY_TYPES)[number])) {
      return `${row}: kapasite tipi seçin`;
    }
    if (typeof it.invoice_amount !== 'number' || it.invoice_amount < 0) {
      return `${row}: geçerli bir fatura tutarı girin`;
    }
    if (typeof it.payable_amount !== 'number' || it.payable_amount < 0) {
      return `${row}: geçerli bir ödenecek tutar girin`;
    }
    if (!CURRENCIES.includes(it.currency as (typeof CURRENCIES)[number])) {
      return `${row}: geçerli bir para birimi seçin`;
    }
  }
  return null;
}

// ============================================================================
// Finans
// ============================================================================

/** Hata mesajı döner; geçerliyse null. */
export function validateFinanceCoverInput(body: CreateFinanceApprovalCoverInput): string | null {
  const headerError = validateHeader(body);
  if (headerError) return headerError;
  if (typeof body.account_available !== 'boolean') return "Hesap durumu bilgisi gerekli";
  if (typeof body.cash_flow_recorded !== 'boolean') return "Nakit giriş/çıkış kaydı bilgisi gerekli";
  if (typeof body.has_rt_enerji_proforma !== 'boolean') return "RT Enerji proforma bilgisi gerekli";
  if (!EXPENSE_AREAS.includes(body.expense_area)) return "Geçerli bir harcama alanı seçin";
  if (!FUNDING_SOURCES.includes(body.funding_source)) return "Geçerli bir niteliği seçin";
  return validateItems(body.items, false);
}

/** finance_approval_cover_requests satırı (request_id hariç). */
export function buildFinanceCoverDetail(body: CreateFinanceApprovalCoverInput) {
  return {
    subject: body.subject,
    request_date: body.request_date,
    document_no: body.document_no,
    account_available: body.account_available,
    cash_flow_recorded: body.cash_flow_recorded,
    expense_area: body.expense_area,
    funding_source: body.funding_source,
    has_rt_enerji_proforma: body.has_rt_enerji_proforma,
    // Opsiyonel ödeme tablosu — toggle kapalıysa alanlar temizlenir (olur yazısıyla aynı davranış)
    has_payment_table: body.has_payment_table || false,
    comparison_approval_date: body.has_payment_table ? body.comparison_approval_date || null : null,
    agreement_amount: body.has_payment_table ? body.agreement_amount || null : null,
    has_contract: body.has_payment_table ? body.has_contract ?? null : null,
    paid_amounts: body.has_payment_table ? body.paid_amounts || [] : [],
    remaining_payment: body.has_payment_table ? body.remaining_payment || null : null,
    requested_payment_amount: body.has_payment_table ? body.requested_payment_amount || null : null,
    remaining_after_payment: body.has_payment_table ? body.remaining_after_payment || null : null,
  };
}

export function buildFinanceCoverItems(body: CreateFinanceApprovalCoverInput, financeRequestId: string) {
  return body.items.map((it, idx) => ({
    finance_request_id: financeRequestId,
    row_order: idx + 1,
    item_date: it.item_date,
    company_name: it.company_name,
    payee_name: it.payee_name,
    item_subject: it.item_subject,
    invoice_amount: it.invoice_amount,
    payable_amount: it.payable_amount,
    currency: it.currency,
  }));
}

// ============================================================================
// Muhasebe
// ============================================================================

const ACCOUNTING_BOOLEAN_FIELDS: Array<[keyof CreateAccountingApprovalCoverInput, string]> = [
  ['demirbas_registered', 'Demirbaş kaydı bilgisi gerekli'],
  ['has_dispatch_note', 'İrsaliye bilgisi gerekli'],
  ['has_delivery_info', 'Teslim alan/eden bilgisi gerekli'],
  ['has_invoice_record', 'Fatura kaydı bilgisi gerekli'],
  ['has_accounting_prog_entry', 'Muhasebe programı bilgisi gerekli'],
  ['has_arvento_record', 'Arvento kaydı bilgisi gerekli'],
  ['paid_from_credit', 'Krediden ödeme bilgisi gerekli'],
];

/** Hata mesajı döner; geçerliyse null. */
export function validateAccountingCoverInput(body: CreateAccountingApprovalCoverInput): string | null {
  const headerError = validateHeader(body);
  if (headerError) return headerError;
  for (const [field, message] of ACCOUNTING_BOOLEAN_FIELDS) {
    if (typeof body[field] !== 'boolean') return message;
  }
  return validateItems(body.items, true);
}

/** accounting_approval_cover_requests satırı (request_id hariç). */
export function buildAccountingCoverDetail(body: CreateAccountingApprovalCoverInput) {
  return {
    subject: body.subject,
    request_date: body.request_date,
    document_no: body.document_no,
    demirbas_registered: body.demirbas_registered,
    has_dispatch_note: body.has_dispatch_note,
    has_delivery_info: body.has_delivery_info,
    has_invoice_record: body.has_invoice_record,
    has_accounting_prog_entry: body.has_accounting_prog_entry,
    has_arvento_record: body.has_arvento_record,
    paid_from_credit: body.paid_from_credit,
  };
}

export function buildAccountingCoverItems(body: CreateAccountingApprovalCoverInput, accountingRequestId: string) {
  return body.items.map((it, idx) => ({
    accounting_request_id: accountingRequestId,
    row_order: idx + 1,
    item_date: it.item_date,
    company_name: it.company_name,
    payee_name: it.payee_name,
    item_subject: it.item_subject,
    capacity_type: it.capacity_type,
    invoice_amount: it.invoice_amount,
    payable_amount: it.payable_amount,
    currency: it.currency,
  }));
}
