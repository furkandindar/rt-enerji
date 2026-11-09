// İşe Giriş / İşten Çıkış ONAY formları — client + server ortak tipler ve doğrulama.
//
// İki süreç de kısıtlı (is_restricted) ve maaş içerir: talebi talep sahibi, onay zinciri,
// İK departmanı (workflow_initiators) ve ORG_ADMIN görür; diğer kısıtlı İK süreçleriyle aynı kural.
// Formun tamamını İK doldurur; onaycılar yalnız paraflar (SIGN_ONLY). Takip formlarıyla
// (EMPLOYEE_ONBOARDING / EMPLOYEE_SEPARATION) bağı yoktur.

import {
  SEPARATION_ENTITLEMENT_ROWS,
  SEPARATION_DEDUCTION_ROW,
  computeSeparationTotal,
  type EntitlementKey,
} from './separation-entitlements';

export const ONBOARDING_APPROVAL_CODE = 'EMPLOYEE_ONBOARDING_APPROVAL';
export const SEPARATION_APPROVAL_CODE = 'EMPLOYEE_SEPARATION_APPROVAL';

export const HR_APPROVAL_WORKFLOW_CODES = [ONBOARDING_APPROVAL_CODE, SEPARATION_APPROVAL_CODE] as const;

const SHORT_TEXT_MAX = 200;
const LONG_TEXT_MAX = 2000;
const PERIOD_TEXT_MAX = 40;
/** numeric(14,2) üst sınırı */
const AMOUNT_ABS_MAX = 999_999_999_999.99;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface OnboardingApprovalInput {
  company_name: string;
  project_name: string;
  candidate_name: string;
  candidate_title: string;
  start_date: string;
  request_reason: string;
  replaced_employee_name: string | null;
  replaced_employee_last_salary: number | null;
  candidate_last_salary: number | null;
  info_note: string | null;
  salary_scale_range: string | null;
  proposed_net_salary: number;
  approved_salary: number | null;
}

type EntitlementFields = {
  [K in EntitlementKey as `${K}_period`]: string | null;
} & {
  [K in EntitlementKey as `${K}_amount`]: number | null;
};

export type SeparationApprovalInput = {
  company_name: string;
  project_name: string;
  employee_name: string;
  employee_title: string;
  hire_date: string;
  separation_date: string;
  separation_reason: string;
  last_salary: number | null;
  total_amount: number;
  total_is_manual: boolean;
} & EntitlementFields;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

class InputError extends Error {}

const text = (raw: unknown, label: string, opts: { required?: boolean; max?: number } = {}): string | null => {
  const max = opts.max ?? SHORT_TEXT_MAX;
  if (raw !== null && raw !== undefined && typeof raw !== 'string') throw new InputError(`${label} geçersiz`);
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    if (opts.required) throw new InputError(`${label} zorunludur`);
    return null;
  }
  if (value.length > max) throw new InputError(`${label} en fazla ${max} karakter olabilir`);
  return value;
};

const requiredText = (raw: unknown, label: string, max?: number): string =>
  text(raw, label, { required: true, max }) as string;

const date = (raw: unknown, label: string): string => {
  if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new InputError(`${label} zorunludur`);
  }
  return raw;
};

const amount = (
  raw: unknown,
  label: string,
  opts: { required?: boolean; allowNegative?: boolean } = {}
): number | null => {
  if (raw === null || raw === undefined || raw === '') {
    if (opts.required) throw new InputError(`${label} zorunludur`);
    return null;
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > AMOUNT_ABS_MAX) throw new InputError(`${label} geçersiz`);
  if (!opts.allowNegative && n < 0) throw new InputError(`${label} eksi olamaz`);
  return Math.round(n * 100) / 100;
};

const parse = <T>(fn: () => T): ParseResult<T> => {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    if (err instanceof InputError) return { ok: false, error: err.message };
    throw err;
  }
};

const obj = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Geçersiz form verisi');
  return raw as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Doğrulama (POST ve PATCH aynı tam payload'ı bekler)
// ---------------------------------------------------------------------------

export function parseOnboardingApprovalInput(raw: unknown): ParseResult<OnboardingApprovalInput> {
  return parse(() => {
    const b = obj(raw);
    return {
      company_name: requiredText(b.company_name, 'Şirket unvanı'),
      project_name: requiredText(b.project_name, 'Proje adı'),
      candidate_name: requiredText(b.candidate_name, 'Adayın adı soyadı'),
      candidate_title: requiredText(b.candidate_title, 'Görev unvanı'),
      start_date: date(b.start_date, 'İşe başlama tarihi'),
      request_reason: requiredText(b.request_reason, 'Personel talep nedeni', LONG_TEXT_MAX),
      replaced_employee_name: text(b.replaced_employee_name, 'Ayrılan personelin adı soyadı'),
      replaced_employee_last_salary: amount(b.replaced_employee_last_salary, 'Ayrılan personelin son ücreti'),
      candidate_last_salary: amount(b.candidate_last_salary, 'Adayın son aldığı ücret'),
      info_note: text(b.info_note, 'Bilgi notu', { max: LONG_TEXT_MAX }),
      salary_scale_range: text(b.salary_scale_range, 'Mevcut ücret skala aralığı'),
      proposed_net_salary: amount(b.proposed_net_salary, 'Önerilen ücret (net)', { required: true }) as number,
      approved_salary: amount(b.approved_salary, 'Uygun görülen ücret'),
    };
  });
}

export function parseSeparationApprovalInput(raw: unknown): ParseResult<SeparationApprovalInput> {
  return parse(() => {
    const b = obj(raw);
    // Hata mesajları formdaki sırayla: önce üst bilgiler, sonra hak tablosu
    const head = {
      company_name: requiredText(b.company_name, 'Şirket unvanı'),
      project_name: requiredText(b.project_name, 'Proje adı'),
      employee_name: requiredText(b.employee_name, 'Çalışanın adı soyadı'),
      employee_title: requiredText(b.employee_title, 'Görev unvanı'),
      hire_date: date(b.hire_date, 'İşe giriş tarihi'),
      separation_date: date(b.separation_date, 'İşten çıkış tarihi'),
      separation_reason: requiredText(b.separation_reason, 'İşten çıkış sebebi', LONG_TEXT_MAX),
      last_salary: amount(b.last_salary, 'Son maaşı'),
    };
    if (head.separation_date < head.hire_date) {
      throw new InputError('İşten çıkış tarihi işe giriş tarihinden önce olamaz');
    }

    const entitlements = {} as EntitlementFields;
    for (const row of [...SEPARATION_ENTITLEMENT_ROWS, SEPARATION_DEDUCTION_ROW]) {
      const isDeduction = row.key === SEPARATION_DEDUCTION_ROW.key;
      entitlements[`${row.key}_period`] = text(b[`${row.key}_period`], `${row.label} (gün/ay/yıl)`, { max: PERIOD_TEXT_MAX });
      entitlements[`${row.key}_amount`] = amount(b[`${row.key}_amount`], row.label, { allowNegative: !isDeduction });
    }

    // TOPLAM sunucuda yeniden hesaplanır; yalnız İK elle düzelttiyse girilen değer esas alınır.
    const totalIsManual = b.total_is_manual === true;
    const computed = computeSeparationTotal(entitlements);
    const total = totalIsManual
      ? (amount(b.total_amount, 'Toplam', { required: true, allowNegative: true }) as number)
      : computed;

    return {
      ...head,
      ...entitlements,
      total_amount: total,
      // Elle girilen değer hesaplananla aynıysa elle düzeltme sayılmaz
      total_is_manual: totalIsManual && total !== computed,
    };
  });
}
