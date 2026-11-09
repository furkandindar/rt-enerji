import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PdfApproval, SignatureInfo } from './types';
import {
  hrStyles, HR_FORM_COLORS, HrFormHeader, FieldRow, SectionTitle, ParafRow, FounderOnayBox,
  formatDateOnly, formatTl, staticApprovalsInOrder,
} from './hr-approval-form-shared';
import {
  SEPARATION_ENTITLEMENT_ROWS, SEPARATION_DEDUCTION_ROW, computeSeparationTotal,
} from '@/lib/hr-approval/separation-entitlements';

// İşten Çıkış Onay Formu (MİY-EK-03_10) — EMPLOYEE_SEPARATION_APPROVAL.
// Zincir: 1 İK (talep sahibi; "Takip formu ekli ve tamam") → 2 Hukuk Müşaviri
// (hukuki uygunluk) → 3 Genel Müdür (GKO) → 4 YKB ıslak imza (tarama).

export interface SeparationApprovalPdfData {
  company_name: string | null;
  project_name: string | null;
  employee_name: string | null;
  employee_title: string | null;
  hire_date: string | null;
  separation_date: string | null;
  separation_reason: string | null;
  last_salary: number | string | null;
  total_amount: number | string | null;
  total_is_manual?: boolean | null;
  [key: string]: string | number | boolean | null | undefined;
}

interface Props {
  request: { request_no?: string | null; created_at?: string | null };
  separationApprovalRequest: SeparationApprovalPdfData;
  approvals: PdfApproval[];
  signatures?: Record<string, SignatureInfo>;
}

const RED = HR_FORM_COLORS.red;

const t = StyleSheet.create({
  head: { flexDirection: 'row', borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, minHeight: 20 },
  headLabel: { width: '42%', borderRightWidth: 1, borderColor: HR_FORM_COLORS.black },
  headPeriod: { width: '24%', borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'center' },
  headAmount: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headText: { fontSize: 10, fontWeight: 700 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, minHeight: 18 },
  label: { width: '42%', paddingVertical: 3, paddingHorizontal: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center' },
  labelText: { fontSize: 9.5, fontWeight: 700 },
  period: { width: '24%', paddingVertical: 3, paddingHorizontal: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'center' },
  periodText: { fontSize: 9 },
  amount: { flex: 1, paddingVertical: 3, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'flex-end' },
  amountText: { fontSize: 9.5 },
  totalLabel: { width: '66%', paddingVertical: 4, paddingHorizontal: 8, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'flex-end' },
  totalText: { fontSize: 10, fontWeight: 700 },
  spacer: { minHeight: 14, borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black },
});

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Eksi tutar = şirket alacaklı → kırmızı (kağıttaki kural). */
const AmountCell: React.FC<{ value: number | null }> = ({ value }) => (
  <View style={t.amount}>
    <Text style={[t.amountText, value !== null && value < 0 ? { color: HR_FORM_COLORS.negative, fontWeight: 700 } : {}]}>
      {value === null ? '' : formatTl(value)}
    </Text>
  </View>
);

export const SeparationApprovalPDFTemplate: React.FC<Props> = ({
  request, separationApprovalRequest: d, approvals, signatures = {},
}) => {
  const requesterApproval = approvals.find(
    (a) => a.workflow_step?.approver_type === 'REQUESTER' && a.workflow_step?.phase !== 'COMPLETION'
  );
  const [legal, gm] = staticApprovalsInOrder(approvals);
  const gmName = gm ? `${gm.approver.first_name ?? ''} ${gm.approver.last_name ?? ''}`.trim().toLocaleUpperCase('tr-TR') : 'GENEL MÜDÜR';

  const total = toNumber(d.total_amount) ?? computeSeparationTotal(d as Record<string, number | null>);
  const deductions = toNumber(d.deductions_amount);
  return (
    <Document>
      <Page size="A4" style={hrStyles.page}>
        <View style={hrStyles.frame}>
          <HrFormHeader
            title="İŞTEN ÇIKIŞ ONAY FORMU"
            color={RED}
            textColor={HR_FORM_COLORS.white}
            requestNo={request.request_no}
            createdAt={request.created_at}
          />

          <FieldRow label="Şirket Unvanı" value={d.company_name} hint="SGK kaydı olan şirket" />
          <FieldRow label="Proje Adı" value={d.project_name} hint="Fiilen çalıştığı proje ve/veya ofis" />

          <SectionTitle text="İŞTEN ÇIKIŞI İSTENEN ADAYIN" color={RED} />
          <FieldRow label="Adı Soyadı" value={d.employee_name} />
          <FieldRow label="Görev Unvanı" value={d.employee_title} />
          <FieldRow label="İşe Giriş Tarihi" value={formatDateOnly(d.hire_date)} />
          <FieldRow label="İşten Çıkış Tarihi" value={formatDateOnly(d.separation_date)} />
          <FieldRow label="İşten Çıkış Sebebi" value={d.separation_reason} />
          <FieldRow label="Son Maaşı" value={formatTl(d.last_salary)} />

          {/* Hak tablosu */}
          <View style={t.head} wrap={false}>
            <View style={t.headLabel} />
            <View style={t.headPeriod}><Text style={t.headText}>GÜN/AY/YIL</Text></View>
            <View style={t.headAmount}><Text style={t.headText}>TL KARŞILIĞI</Text></View>
          </View>
          {SEPARATION_ENTITLEMENT_ROWS.map((row) => (
            <View key={row.key} style={t.row} wrap={false}>
              <View style={t.label}><Text style={t.labelText}>{row.label}</Text></View>
              <View style={t.period}><Text style={t.periodText}>{(d[`${row.key}_period`] as string | null) || ''}</Text></View>
              <AmountCell value={toNumber(d[`${row.key}_amount`])} />
            </View>
          ))}
          <View style={t.row} wrap={false}>
            <View style={[t.label, { backgroundColor: HR_FORM_COLORS.deductionFill }]}>
              <Text style={[t.labelText, { color: HR_FORM_COLORS.negative }]}>{SEPARATION_DEDUCTION_ROW.label}</Text>
            </View>
            <View style={t.period}><Text style={t.periodText}>{(d.deductions_period as string | null) || ''}</Text></View>
            <View style={t.amount}>
              <Text style={t.amountText}>{deductions ? `- ${formatTl(deductions)}` : ''}</Text>
            </View>
          </View>
          <View style={t.row} wrap={false}>
            <View style={t.totalLabel}><Text style={t.totalText}>TOPLAM</Text></View>
            <View style={t.amount}>
              <Text style={[t.totalText, total < 0 ? { color: HR_FORM_COLORS.negative } : {}]}>{formatTl(total)}</Text>
            </View>
          </View>

          <View style={t.spacer} />
          <ParafRow description={'İŞTEN ÇIKIŞ TAKİP FORMU\nEKLİ VE TAMAM'} role="İK" approval={requesterApproval} signatures={signatures} />
          <ParafRow description="HUKUKİ UYGUNLUK" role={'HUKUK\nMÜŞAVİRİ'} approval={legal} signatures={signatures} />
          <ParafRow description={gmName} role="GKO" approval={gm} signatures={signatures} />

          <FounderOnayBox />
        </View>
      </Page>
    </Document>
  );
};
