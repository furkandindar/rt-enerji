import React from 'react';
import { Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import path from 'path';
import { SignatureFont } from '@/lib/signature/types';
import { formatTrDate } from '@/lib/timezone';
import { formatMoney } from '@/lib/currency';
import type { PdfApproval, SignatureInfo } from './types';

// İşe Giriş / İşten Çıkış ONAY formlarının (MİY-EK-03_11 / 03_10) ortak parçaları.
// Kağıt düzeni korunur: renkli başlık bandı, etiket | değer tablosu, paraf satırları
// (açıklama | rol | imza + tarih) ve en altta YKB'nin ıslak imzası için boş ONAY kutusu.

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 500 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
  ],
});
Font.register({ family: 'Ballet', src: 'https://fonts.gstatic.com/s/ballet/v27/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3C4G-EiAou6Y.ttf' });
Font.register({ family: 'Great Vibes', src: 'https://fonts.gstatic.com/s/greatvibes/v18/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf' });
Font.register({ family: 'Sacramento', src: 'https://fonts.gstatic.com/s/sacramento/v15/buEzpo6gcdjy0EiZMBUG0CoV_NxLeiw.ttf' });

const signatureFontMap: Record<SignatureFont, string> = {
  'Ballet': 'Ballet',
  'Great Vibes': 'Great Vibes',
  'Sacramento': 'Sacramento',
};

/** Şirket kurucusu — sistemde onay vermez; PDF basılıp ıslak imzalanır. */
export const FOUNDER_NAME = 'RAMAZAN TAŞ';

export const HR_FORM_COLORS = {
  green: '#00B050',
  red: '#E00000',
  black: '#000000',
  white: '#FFFFFF',
  grey: '#777777',
  hint: '#9A9A9A',
  negative: '#C00000',
  deductionFill: '#F4B6B6',
};

const LABEL_WIDTH = '42%';

export const hrStyles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 34, paddingBottom: 28, fontSize: 9, fontFamily: 'Roboto', backgroundColor: HR_FORM_COLORS.white },
  frame: { borderWidth: 1.2, borderColor: HR_FORM_COLORS.black },

  // Başlık bandı: logo (beyaz) + renkli başlık
  header: { flexDirection: 'row', borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, minHeight: 40 },
  logoCell: { width: 70, padding: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 52, height: 28, objectFit: 'contain' },
  titleCell: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titleText: { fontSize: 13, fontWeight: 700, letterSpacing: 0.4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 3, borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black },
  metaText: { fontSize: 7, color: HR_FORM_COLORS.grey },

  // Etiket | değer satırı
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, minHeight: 18 },
  labelCell: { width: LABEL_WIDTH, paddingVertical: 3, paddingHorizontal: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center' },
  labelText: { fontSize: 9.5, fontWeight: 700 },
  labelHint: { fontSize: 6.5, color: HR_FORM_COLORS.hint, marginTop: 1 },
  valueCell: { flex: 1, paddingVertical: 3, paddingHorizontal: 5, justifyContent: 'center' },
  valueText: { fontSize: 9.5 },
  valueEmpty: { fontSize: 9.5, color: HR_FORM_COLORS.hint },

  // Bölüm başlığı (tam genişlik)
  section: { borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, paddingVertical: 7, alignItems: 'center' },
  sectionText: { fontSize: 11.5, fontWeight: 700 },

  // Paraf tablosu
  parafRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: HR_FORM_COLORS.black, minHeight: 46 },
  parafDesc: { width: LABEL_WIDTH, padding: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'center' },
  parafDescText: { fontSize: 10, fontWeight: 700, textAlign: 'center' },
  parafRole: { width: '22%', padding: 5, borderRightWidth: 1, borderColor: HR_FORM_COLORS.black, justifyContent: 'center', alignItems: 'center' },
  parafRoleText: { fontSize: 10.5, fontWeight: 700, textAlign: 'center' },
  parafSign: { flex: 1, paddingHorizontal: 5, paddingTop: 2, paddingBottom: 3, alignItems: 'center' },
  parafCaption: { fontSize: 6, color: HR_FORM_COLORS.hint, alignSelf: 'flex-start' },
  signatureText: { fontSize: 15, color: '#1a365d', textAlign: 'center' },
  signerName: { fontSize: 7, textAlign: 'center' },
  signedAt: { fontSize: 7, color: HR_FORM_COLORS.grey, textAlign: 'center' },
  rejected: { fontSize: 9, fontWeight: 700, color: '#DC2626', marginTop: 8 },
  onBehalf: { fontSize: 6, color: HR_FORM_COLORS.grey },

  // ONAY (YKB, ıslak imza)
  onayBox: { minHeight: 120, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  onayTitle: { fontSize: 12, fontWeight: 700 },
  onayName: { fontSize: 12, fontWeight: 700, marginTop: 2 },
});

/** 'YYYY-MM-DD' (date kolonu) → 'dd.MM.yyyy'. Saat dilimi dönüşümü yapılmaz. */
export const formatDateOnly = (value: string | null | undefined): string => {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : value;
};

/** Para: "12.345,60 TL"; boşsa boş metin. */
export const formatTl = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n, 'TRY') : '';
};

const getLogoPath = () => path.join(process.cwd(), 'public', 'logo.png');

export const HrFormHeader: React.FC<{
  title: string;
  color: string;
  textColor?: string;
  requestNo?: string | null;
  createdAt?: string | null;
}> = ({ title, color, textColor = HR_FORM_COLORS.black, requestNo, createdAt }) => (
  <>
    <View style={hrStyles.header}>
      <View style={hrStyles.logoCell}><Image src={getLogoPath()} style={hrStyles.logo} /></View>
      <View style={[hrStyles.titleCell, { backgroundColor: color }]}>
        <Text style={[hrStyles.titleText, { color: textColor }]}>{title}</Text>
      </View>
    </View>
    {requestNo || createdAt ? (
      <View style={hrStyles.meta}>
        <Text style={hrStyles.metaText}>{requestNo ? `Talep No: ${requestNo}` : ''}</Text>
        <Text style={hrStyles.metaText}>{createdAt ? `Oluşturma: ${formatTrDate(createdAt, '.')}` : ''}</Text>
      </View>
    ) : null}
  </>
);

interface FieldRowProps {
  label: string;
  value?: string | null;
  /** Etiketin altında küçük gri açıklama (kağıttaki ipucu metni) */
  hint?: string;
  labelColor?: string;
  minHeight?: number;
  valueColor?: string;
}

export const FieldRow: React.FC<FieldRowProps> = ({ label, value, hint, labelColor, minHeight, valueColor }) => (
  <View style={[hrStyles.row, minHeight ? { minHeight } : {}]} wrap={false}>
    <View style={hrStyles.labelCell}>
      <Text style={[hrStyles.labelText, labelColor ? { color: labelColor } : {}]}>{label}</Text>
      {hint ? <Text style={hrStyles.labelHint}>{hint}</Text> : null}
    </View>
    <View style={hrStyles.valueCell}>
      <Text style={[hrStyles.valueText, valueColor ? { color: valueColor } : {}]}>{value || ''}</Text>
    </View>
  </View>
);

export const SectionTitle: React.FC<{ text: string; color?: string }> = ({ text, color }) => (
  <View style={hrStyles.section} wrap={false}>
    <Text style={[hrStyles.sectionText, color ? { color } : {}]}>{text}</Text>
  </View>
);

interface ParafRowProps {
  description: string;
  role: string;
  approval?: PdfApproval | null;
  signatures: Record<string, SignatureInfo>;
}

/** Açıklama | Rol | PARAF VE TARİH (imza + ad + karar tarihi) */
export const ParafRow: React.FC<ParafRowProps> = ({ description, role, approval, signatures }) => {
  const sig = approval ? signatures[approval.approver.id] : undefined;
  const name = approval ? `${approval.approver.first_name ?? ''} ${approval.approver.last_name ?? ''}`.trim() : '';
  return (
    <View style={hrStyles.parafRow} wrap={false}>
      <View style={hrStyles.parafDesc}><Text style={hrStyles.parafDescText}>{description}</Text></View>
      <View style={hrStyles.parafRole}><Text style={hrStyles.parafRoleText}>{role}</Text></View>
      <View style={hrStyles.parafSign}>
        <Text style={hrStyles.parafCaption}>PARAF VE TARİH</Text>
        {approval?.status === 'REJECTED' ? (
          <Text style={hrStyles.rejected}>Reddedildi</Text>
        ) : approval?.status === 'APPROVED' && sig ? (
          <>
            <Text style={[hrStyles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>
            {sig.onBehalfNote ? <Text style={hrStyles.onBehalf}>{sig.onBehalfNote}</Text> : null}
            <Text style={hrStyles.signerName}>{name}</Text>
            <Text style={hrStyles.signedAt}>{formatTrDate(approval.decided_at, '.')}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
};

/** YKB onayı: sistemde imza yok, kağıt üzerinde ıslak imza alanı. */
export const FounderOnayBox: React.FC = () => (
  <View style={hrStyles.onayBox} wrap={false}>
    <Text style={hrStyles.onayTitle}>ONAY</Text>
    <Text style={hrStyles.onayName}>{FOUNDER_NAME}</Text>
  </View>
);

/** Aktif turdaki sabit pozisyonlu onaylar, adım sırasına göre (YKB tarama adımı hariç). */
export const staticApprovalsInOrder = (approvals: PdfApproval[]): PdfApproval[] =>
  approvals
    .filter((a) => a.workflow_step?.approver_type === 'STATIC_POSITION' && a.workflow_step?.phase !== 'COMPLETION')
    .sort((a, b) => (a.workflow_step?.step_order ?? 0) - (b.workflow_step?.step_order ?? 0));
