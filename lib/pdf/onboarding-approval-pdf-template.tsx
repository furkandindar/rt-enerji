import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import type { PdfApproval, SignatureInfo } from './types';
import {
  hrStyles, HR_FORM_COLORS, HrFormHeader, FieldRow, SectionTitle, ParafRow, FounderOnayBox,
  formatDateOnly, formatTl, staticApprovalsInOrder,
} from './hr-approval-form-shared';

// İşe Giriş Onay Formu (MİY-EK-03_11) — EMPLOYEE_ONBOARDING_APPROVAL.
// Zincir: 1 İK (talep sahibi) → 2 Genel Müdür (GKO paraf) → 3 Asistan (Takip formu
// 1. ve 3. madde kontrolü paraf) → 4 YKB ıslak imza (tarama). Maaş içerir.

export interface OnboardingApprovalPdfData {
  company_name: string | null;
  project_name: string | null;
  candidate_name: string | null;
  candidate_title: string | null;
  start_date: string | null;
  request_reason: string | null;
  replaced_employee_name: string | null;
  replaced_employee_last_salary: number | string | null;
  candidate_last_salary: number | string | null;
  info_note: string | null;
  salary_scale_range: string | null;
  proposed_net_salary: number | string | null;
  approved_salary: number | string | null;
}

interface Props {
  request: { request_no?: string | null; created_at?: string | null };
  onboardingApprovalRequest: OnboardingApprovalPdfData;
  approvals: PdfApproval[];
  signatures?: Record<string, SignatureInfo>;
}

const GREEN = HR_FORM_COLORS.green;

export const OnboardingApprovalPDFTemplate: React.FC<Props> = ({
  request, onboardingApprovalRequest: d, approvals, signatures = {},
}) => {
  const [gm, assistant] = staticApprovalsInOrder(approvals);
  const gmName = gm ? `${gm.approver.first_name ?? ''} ${gm.approver.last_name ?? ''}`.trim().toLocaleUpperCase('tr-TR') : 'GENEL MÜDÜR';

  return (
    <Document>
      <Page size="A4" style={hrStyles.page}>
        <View style={hrStyles.frame}>
          <HrFormHeader title="İŞE GİRİŞ ONAY FORMU" color={GREEN} requestNo={request.request_no} createdAt={request.created_at} />

          <FieldRow label="Şirket Unvanı" value={d.company_name} hint="SGK kaydı olan şirket" />
          <FieldRow label="Proje Adı" value={d.project_name} hint="Fiilen çalıştığı proje ve/veya ofis" />

          <SectionTitle text="GÖREVE BAŞLATILMASI İSTENEN ADAYIN" color={GREEN} />
          <FieldRow label="Adı Soyadı" value={d.candidate_name} />
          <FieldRow label="Görev Unvanı" value={d.candidate_title} />
          <FieldRow label="İşe Başlama Tarihi" value={formatDateOnly(d.start_date)} />
          <FieldRow label="PERSONEL TALEP NEDENİ" labelColor={GREEN} value={d.request_reason} minHeight={44} />
          <FieldRow label="Ayrılan Personelin Adı Soyadı" value={d.replaced_employee_name} />
          <FieldRow label="Son Aldığı Ücret" hint="Ayrılan personelin son ücreti" value={formatTl(d.replaced_employee_last_salary)} />
          <FieldRow label="Son Aldığı Ücret" hint="İşe girecek personelin son aldığı ücret" value={formatTl(d.candidate_last_salary)} />
          <FieldRow
            label="BİLGİ NOTU"
            labelColor={GREEN}
            hint="Personel hakkında bilinmesi gereken olumlu veya olumsuz, özellikli bir durum"
            value={d.info_note}
            minHeight={52}
          />

          <SectionTitle text="ÜCRET BİLGİSİ" />
          <FieldRow label="Mevcut Ücret Skala Aralığı" value={d.salary_scale_range} />
          <FieldRow label="Önerilen Ücret (Net)" value={formatTl(d.proposed_net_salary)} />
          <FieldRow label="Uygun Görülen Ücret" value={formatTl(d.approved_salary)} />

          <ParafRow description={gmName} role="GKO" approval={gm} signatures={signatures} />
          <ParafRow
            description={'İŞE GİRİŞ TAKİP FORMU\n1. ve 3. maddelerin kontrolü'}
            role="ASİSTAN"
            approval={assistant}
            signatures={signatures}
          />

          <FounderOnayBox />
        </View>
      </Page>
    </Document>
  );
};
