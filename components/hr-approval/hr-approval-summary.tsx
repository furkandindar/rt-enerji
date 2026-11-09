"use client";

// İşe Giriş / İşten Çıkış ONAY formlarının salt okunur özeti.
// Hem onaycı ekranında (approval-detail-view) hem talep detayında
// (request-detail-content) kullanılır; alan sırası kağıt formu (ve PDF'i) izler.

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEPARATION_ENTITLEMENT_ROWS,
  SEPARATION_DEDUCTION_ROW,
  computeSeparationTotal,
} from "@/lib/hr-approval/separation-entitlements";
import {
  HR_APPROVAL_VISIBILITY_NOTE,
  formatDateOnlyLong,
  formatTlOrDash,
  type OnboardingApprovalRecord,
  type SeparationApprovalRecord,
} from "@/lib/hr-approval/display";

function Field({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold whitespace-pre-wrap break-words">{empty ? "-" : value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold">{children}</p>;
}

export function SalaryVisibilityNote() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{HR_APPROVAL_VISIBILITY_NOTE}</span>
    </div>
  );
}

export function OnboardingApprovalSummary({ data }: { data: OnboardingApprovalRecord }) {
  return (
    <>
      <SalaryVisibilityNote />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Şirket Unvanı" value={data.company_name} />
        <Field label="Proje Adı" value={data.project_name} />
      </div>

      <div className="space-y-3 border-t pt-3">
        <SectionHeading>Göreve Başlatılması İstenen Aday</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Adı Soyadı" value={data.candidate_name} />
          <Field label="Görev Unvanı" value={data.candidate_title} />
          <Field label="İşe Başlama Tarihi" value={formatDateOnlyLong(data.start_date)} />
          <Field label="Adayın Son Aldığı Ücret" value={formatTlOrDash(data.candidate_last_salary)} />
        </div>
        <Field label="Personel Talep Nedeni" value={data.request_reason} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ayrılan Personelin Adı Soyadı" value={data.replaced_employee_name} />
          <Field label="Ayrılan Personelin Son Ücreti" value={formatTlOrDash(data.replaced_employee_last_salary)} />
        </div>
        <Field label="Bilgi Notu" value={data.info_note} />
      </div>

      <div className="space-y-3 border-t pt-3">
        <SectionHeading>Ücret Bilgisi</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Mevcut Ücret Skala Aralığı" value={data.salary_scale_range} />
          <Field label="Önerilen Ücret (Net)" value={formatTlOrDash(data.proposed_net_salary)} />
          <Field label="Uygun Görülen Ücret" value={formatTlOrDash(data.approved_salary)} />
        </div>
      </div>
    </>
  );
}

type AmountKey = `${(typeof SEPARATION_ENTITLEMENT_ROWS)[number]["key"] | typeof SEPARATION_DEDUCTION_ROW.key}_amount`;
type PeriodKey = `${(typeof SEPARATION_ENTITLEMENT_ROWS)[number]["key"] | typeof SEPARATION_DEDUCTION_ROW.key}_period`;

export function SeparationApprovalSummary({ data }: { data: SeparationApprovalRecord }) {
  const amount = (key: string) => data[`${key}_amount` as AmountKey] as number | null;
  const period = (key: string) => data[`${key}_period` as PeriodKey] as string | null;
  const computedTotal = computeSeparationTotal(data);
  const total = data.total_amount ?? computedTotal;
  const deduction = amount(SEPARATION_DEDUCTION_ROW.key);

  return (
    <>
      <SalaryVisibilityNote />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Şirket Unvanı" value={data.company_name} />
        <Field label="Proje Adı" value={data.project_name} />
      </div>

      <div className="space-y-3 border-t pt-3">
        <SectionHeading>İşten Çıkışı İstenen Çalışan</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Adı Soyadı" value={data.employee_name} />
          <Field label="Görev Unvanı" value={data.employee_title} />
          <Field label="İşe Giriş Tarihi" value={formatDateOnlyLong(data.hire_date)} />
          <Field label="İşten Çıkış Tarihi" value={formatDateOnlyLong(data.separation_date)} />
        </div>
        <Field label="İşten Çıkış Sebebi" value={data.separation_reason} />
        <Field label="Son Maaşı" value={formatTlOrDash(data.last_salary)} />
      </div>

      <div className="space-y-2 border-t pt-3">
        <SectionHeading>Hak Edişler</SectionHeading>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Kalem</th>
                <th className="px-3 py-2 font-medium">Gün/Ay/Yıl</th>
                <th className="px-3 py-2 text-right font-medium">TL Karşılığı</th>
              </tr>
            </thead>
            <tbody>
              {SEPARATION_ENTITLEMENT_ROWS.map((row) => {
                const value = amount(row.key);
                return (
                  <tr key={row.key} className="border-b">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{period(row.key) || "-"}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        value !== null && value < 0 && "font-semibold text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatTlOrDash(value)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-b bg-red-50/60 dark:bg-red-950/20">
                <td className="px-3 py-2">{SEPARATION_DEDUCTION_ROW.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{period(SEPARATION_DEDUCTION_ROW.key) || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {deduction ? `- ${formatTlOrDash(deduction)}` : formatTlOrDash(deduction)}
                </td>
              </tr>
              <tr className="bg-muted/30">
                <td className="px-3 py-2 font-semibold" colSpan={2}>
                  TOPLAM
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-bold tabular-nums",
                    total < 0 && "text-red-600 dark:text-red-400"
                  )}
                >
                  {formatTlOrDash(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {data.total_is_manual && (
          <p className="text-xs text-muted-foreground">
            Toplam İK tarafından elle girildi (satırlardan hesaplanan: {formatTlOrDash(computedTotal)}).
          </p>
        )}
      </div>
    </>
  );
}
