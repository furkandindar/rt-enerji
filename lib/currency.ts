// Ödeme kalemi para birimi yardımcıları (Onay Kapağı Finans/Muhasebe).
// DB karşılığı: public.payment_currency enum'u (TRY | USD | EUR).
// Mukayese Formu'nun form-seviyesi mukayese_currency enum'undan bağımsızdır;
// buradaki birim satır (kalem) seviyesinde tutulur.

export type PaymentCurrency = 'TRY' | 'USD' | 'EUR';

export const PAYMENT_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

export const paymentCurrencyLabels: Record<PaymentCurrency, string> = {
  TRY: 'TL',
  USD: 'USD',
  EUR: 'EUR',
};

const numberFormatTr = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12345.6 → "12.345,60" */
export const formatAmountTr = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return numberFormatTr.format(value);
};

/** 12345.6, 'EUR' → "12.345,60 EUR" (bilinmeyen/boş birim TL varsayılır) */
export const formatMoney = (
  value: number | null | undefined,
  currency: string | null | undefined
): string => {
  if (value === null || value === undefined) return '-';
  const label = paymentCurrencyLabels[(currency as PaymentCurrency) || 'TRY'] ?? currency ?? 'TL';
  return `${numberFormatTr.format(value)} ${label}`;
};

export interface CurrencyTotal {
  currency: PaymentCurrency;
  invoice: number;
  payable: number;
}

/**
 * Kalemleri para birimine göre gruplayıp toplar. Sonuç TRY, USD, EUR sabit
 * sırasında ve yalnız o birimde kalem olan girdileri içerir. currency alanı
 * boş olan eski kayıtlar TL sayılır.
 */
export function sumItemsByCurrency(
  items: Array<{
    currency?: string | null;
    invoice_amount?: number | string | null;
    payable_amount?: number | string | null;
  }>
): CurrencyTotal[] {
  const totals = new Map<PaymentCurrency, CurrencyTotal>();
  for (const it of items) {
    const currency: PaymentCurrency = PAYMENT_CURRENCIES.includes(
      it.currency as PaymentCurrency
    )
      ? (it.currency as PaymentCurrency)
      : 'TRY';
    const entry = totals.get(currency) ?? { currency, invoice: 0, payable: 0 };
    entry.invoice += Number(it.invoice_amount) || 0;
    entry.payable += Number(it.payable_amount) || 0;
    totals.set(currency, entry);
  }
  return PAYMENT_CURRENCIES.filter((c) => totals.has(c)).map((c) => totals.get(c)!);
}

/** [{TRY..}, {EUR..}] → "1.000,00 TL + 500,00 EUR" */
export const joinCurrencyTotals = (
  totals: CurrencyTotal[],
  field: 'invoice' | 'payable'
): string =>
  totals.length === 0
    ? formatMoney(0, 'TRY')
    : totals.map((t) => formatMoney(t[field], t.currency)).join(' + ');
