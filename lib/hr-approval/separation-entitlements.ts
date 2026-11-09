// İşten Çıkış Onay Formu — hak tablosu (kağıt MİY-EK-03_10'daki satırlar).
// Form, API ve PDF aynı satır listesini ve toplam hesabını buradan kullanır.
//
// DB: separation_approval_requests.<key>_period (GÜN/AY/YIL — serbest metin süre,
// "5 Gün", "1 Yıl") + <key>_amount (TL). Eksi tutar = şirket alacaklı (kırmızı).
// Kesintiler pozitif girilir ve toplamdan düşülür. TOPLAM otomatik hesaplanır;
// İK elle değiştirirse total_is_manual = true olur ve girilen değer esas alınır.

export const SEPARATION_ENTITLEMENT_ROWS = [
  { key: 'final_salary', label: 'Hakedilen Son Maaş' },
  { key: 'severance', label: 'Kıdem Tazminat Hakkı' },
  { key: 'notice', label: 'İhbar Süresi/İhbar Tazminatı Hakkı', creditorHint: true },
  { key: 'ugbt', label: 'UGBT Çalışmalarına Ait Hak' },
  { key: 'overtime', label: 'Fazla Mesailerine Ait Hak' },
  { key: 'weekend_work', label: 'Hafta Sonu Çalışmalarına Ait Hak' },
  { key: 'annual_leave', label: 'Yıllık İzin Bakiyesi', creditorHint: true },
] as const;

export const SEPARATION_DEDUCTION_ROW = { key: 'deductions', label: 'Yapılacak Kesintiler' } as const;

/** Kağıttaki not: şirket alacaklıysa tutar eksi (kırmızı) girilir. */
export const CREDITOR_HINT = 'Şirket alacaklı ise eksi girin';

export type EntitlementKey =
  | (typeof SEPARATION_ENTITLEMENT_ROWS)[number]['key']
  | typeof SEPARATION_DEDUCTION_ROW.key;

export type EntitlementAmounts = Partial<Record<`${EntitlementKey}_amount`, number | string | null>>;

const toKurus = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** TOPLAM = hak satırları − kesintiler (kuruş üzerinden; kayan nokta hatası yok). */
export function computeSeparationTotal(values: EntitlementAmounts): number {
  const rights = SEPARATION_ENTITLEMENT_ROWS.reduce(
    (sum, row) => sum + toKurus(values[`${row.key}_amount`]),
    0
  );
  return (rights - toKurus(values.deductions_amount)) / 100;
}
