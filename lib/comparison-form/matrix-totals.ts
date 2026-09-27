// Mukayese matrisi hesapları — matris editörü, onay/talep detayı ve PDF aynı
// fonksiyonu kullanır.
//
// Para birimi ve KDV oranı kalem (ITEM satırı) bazındadır; bir satırdaki tüm
// firma fiyatları o satırın biriminde girilir. Satırda değer yoksa (eski
// kayıtlar) form başlığındaki varsayılan kullanılır.
// Toplamlar para birimine göre ayrı tutulur (MoneyBag). Formda birden fazla
// para birimi varsa firma toplamlarının TL karşılığı, talep anında kaydedilen
// TCMB snapshot'ı ile hesaplanır.

import type { MukayeseCurrency } from '@/lib/workflow/types';

export const MUKAYESE_CURRENCIES: readonly MukayeseCurrency[] = ['TRY', 'USD', 'EUR'];

export const MUKAYESE_CURRENCY_SYMBOL: Record<MukayeseCurrency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

/** Yeni formun / yeni kalemin başlangıç KDV oranı (%) — kullanıcı serbestçe değiştirir */
export const DEFAULT_KDV_RATE = 20;

/** Para birimi → tutar; yalnız kullanılan birimler dolu */
export type MoneyBag = Partial<Record<MukayeseCurrency, number>>;

export interface RowPricing {
  currency: MukayeseCurrency;
  kdvRate: number;
}

export interface MatrixTotalsItem {
  id: string;
  row_type: 'ITEM' | 'SUBTOTAL';
  quantity: number | string | null;
  currency?: string | null;
  kdv_rate?: number | string | null;
}

/** Form başlığındaki varsayılanlar (mukayese_requests.form_currency / kdv_rate) */
export interface MatrixDefaults {
  currency: string | null | undefined;
  kdvRate: number | string | null | undefined;
}

/** TCMB snapshot — 1 birim döviz = ? TL */
export interface MatrixFx {
  usdTry?: number | string | null;
  eurTry?: number | string | null;
}

const isCurrency = (v: unknown): v is MukayeseCurrency =>
  MUKAYESE_CURRENCIES.includes(v as MukayeseCurrency);

const toFiniteNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Satırın para birimi / KDV'si; satırda yoksa başlık varsayılanı */
export function resolveRowPricing(
  item: Pick<MatrixTotalsItem, 'currency' | 'kdv_rate'>,
  defaults: MatrixDefaults,
): RowPricing {
  const currency = isCurrency(item.currency)
    ? item.currency
    : isCurrency(defaults.currency)
      ? defaults.currency
      : 'TRY';
  const kdvRate = toFiniteNumber(item.kdv_rate) ?? toFiniteNumber(defaults.kdvRate) ?? 0;
  return { currency, kdvRate };
}

/** Serbest girilen KDV oranı geçerli mi (DB: NUMERIC(5,2), 0–100) */
export const isValidKdvRate = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** 20 → "20", 10.5 → "10,5" */
export const formatKdvRate = (rate: number): string =>
  rate.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Sabit TRY → USD → EUR sırasında dolu girdiler; boş torba → [] */
export function bagEntries(
  bag: MoneyBag | undefined,
): Array<{ currency: MukayeseCurrency; amount: number }> {
  if (!bag) return [];
  return MUKAYESE_CURRENCIES.filter((c) => bag[c] !== undefined).map((c) => ({
    currency: c,
    amount: bag[c] as number,
  }));
}

/** Torbayı TL'ye çevirir; boş torba veya kullanılan bir döviz için kur yoksa null */
export function bagToTry(bag: MoneyBag | undefined, fx: MatrixFx | null | undefined): number | null {
  const entries = bagEntries(bag);
  if (entries.length === 0) return null;
  const rates: Record<MukayeseCurrency, number | null> = {
    TRY: 1,
    USD: toFiniteNumber(fx?.usdTry),
    EUR: toFiniteNumber(fx?.eurTry),
  };
  let sum = 0;
  for (const { currency, amount } of entries) {
    const rate = rates[currency];
    if (!rate || rate <= 0) return null;
    sum += amount * rate;
  }
  return sum;
}

const addTo = (bag: MoneyBag, currency: MukayeseCurrency, amount: number) => {
  bag[currency] = (bag[currency] ?? 0) + amount;
};

/**
 * Türetilmiş değerler:
 * - rowPricing: her ITEM satırının çözülmüş para birimi / KDV'si
 * - subtotalValues: SUBTOTAL satırı için bloktaki ITEM toplamları (KDV hariç)
 * - minMaxByItem: ITEM satırında (>=2 dolu hücre) min/max birim fiyat — satır
 *   içi tek para birimi olduğu için doğrudan karşılaştırılabilir
 * - columnTotals*: firma bazında KDV hariç / KDV / KDV dahil toplam
 * - tryEquivalent: yalnız karışık para biriminde, firma toplamlarının TL
 *   karşılığı (kur yoksa veya firma hiç fiyat girmediyse null)
 */
export function deriveMatrixTotals(
  items: MatrixTotalsItem[],
  supplierIds: string[],
  priceMap: Record<string, number>,
  defaults: MatrixDefaults,
  fx?: MatrixFx | null,
) {
  const rowPricing: Record<string, RowPricing> = {};
  const subtotalValues: Record<string, Record<string, MoneyBag>> = {};
  const minMaxByItem: Record<string, { min: number; max: number }> = {};
  const columnTotalsExKdv: Record<string, MoneyBag> = {};
  const columnKdv: Record<string, MoneyBag> = {};
  const columnTotalsIncKdv: Record<string, MoneyBag> = {};
  // Firma başına, son ara toplamdan bu yana biriken tutarlar
  const blockSums: Record<string, MoneyBag> = {};
  for (const sid of supplierIds) {
    columnTotalsExKdv[sid] = {};
    columnKdv[sid] = {};
    columnTotalsIncKdv[sid] = {};
    blockSums[sid] = {};
  }

  const currencySet = new Set<MukayeseCurrency>();
  const kdvRateSet = new Set<number>();

  for (const it of items) {
    if (it.row_type !== 'ITEM') {
      const row: Record<string, MoneyBag> = {};
      for (const sid of supplierIds) {
        row[sid] = blockSums[sid];
        blockSums[sid] = {};
      }
      subtotalValues[it.id] = row;
      continue;
    }

    const pricing = resolveRowPricing(it, defaults);
    rowPricing[it.id] = pricing;
    currencySet.add(pricing.currency);
    kdvRateSet.add(pricing.kdvRate);

    const qty = toFiniteNumber(it.quantity) ?? 0;
    const unitPrices: number[] = [];
    for (const sid of supplierIds) {
      const up = priceMap[`${it.id}:${sid}`];
      if (typeof up !== 'number') continue;
      const lineTotal = qty * up;
      const kdv = (lineTotal * pricing.kdvRate) / 100;
      addTo(blockSums[sid], pricing.currency, lineTotal);
      addTo(columnTotalsExKdv[sid], pricing.currency, lineTotal);
      addTo(columnKdv[sid], pricing.currency, kdv);
      addTo(columnTotalsIncKdv[sid], pricing.currency, lineTotal + kdv);
      unitPrices.push(up);
    }
    if (unitPrices.length >= 2) {
      minMaxByItem[it.id] = { min: Math.min(...unitPrices), max: Math.max(...unitPrices) };
    }
  }

  const currencies = MUKAYESE_CURRENCIES.filter((c) => currencySet.has(c));
  const kdvRates = [...kdvRateSet].sort((a, b) => a - b);
  const isMixedCurrency = currencies.length > 1;

  // Tek para biriminde toplam zaten tek sayı; TL karşılığı yalnız karışıkta
  let tryEquivalent: {
    exKdv: Record<string, number | null>;
    incKdv: Record<string, number | null>;
  } | null = null;
  if (isMixedCurrency) {
    tryEquivalent = { exKdv: {}, incKdv: {} };
    for (const sid of supplierIds) {
      tryEquivalent.exKdv[sid] = bagToTry(columnTotalsExKdv[sid], fx);
      tryEquivalent.incKdv[sid] = bagToTry(columnTotalsIncKdv[sid], fx);
    }
  }

  return {
    rowPricing,
    subtotalValues,
    minMaxByItem,
    columnTotalsExKdv,
    columnKdv,
    columnTotalsIncKdv,
    tryEquivalent,
    currencies,
    kdvRates,
    isMixedCurrency,
  };
}

export type MatrixTotals = ReturnType<typeof deriveMatrixTotals>;

/** Toplam satırı etiketleri — kullanılan KDV oranlarını gösterir */
export function kdvLabels(kdvRates: number[]): { kdv: string; incKdv: string } {
  const rates = kdvRates.map((r) => `%${formatKdvRate(r)}`).join(', ');
  return {
    kdv: kdvRates.length > 0 ? `KDV (${rates})` : 'KDV',
    incKdv: kdvRates.length === 1 ? `KDV ${rates} Dahil` : 'KDV Dahil',
  };
}
