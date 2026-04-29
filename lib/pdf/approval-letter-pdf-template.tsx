import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import path from 'path';

const getLogoPath = () => path.join(process.cwd(), 'public', 'logo-w-text.png');

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

const colors = {
  black: '#000000',
  white: '#FFFFFF',
  muted: '#666666',
};

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 50, fontSize: 10, fontFamily: 'Roboto', backgroundColor: colors.white },

  // Logo header
  headerContainer: { alignItems: 'center', marginBottom: 4 },
  logoImage: { width: 150, height: 34, objectFit: 'contain' },
  headerDivider: { borderBottomWidth: 1, borderColor: colors.black, marginBottom: 18 },

  // Info rows (Tarih, Firma/Proje, Konu)
  infoRow: { flexDirection: 'row', marginBottom: 4 },
  infoLabel: { width: 90, fontWeight: 700 },
  infoColon: { width: 10 },
  infoValue: { flex: 1 },

  // Intro / outro paragraphs
  intro: { marginTop: 14, marginBottom: 8 },
  outro: { marginTop: 10, marginBottom: 22 },

  // Numbered list
  listItem: { flexDirection: 'row', marginBottom: 4, paddingLeft: 18 },
  listNumber: { width: 18 },
  listText: { flex: 1, textAlign: 'justify', lineHeight: 1.4 },

  // Payment table (kept minimal)
  paymentSection: { marginTop: 8, marginBottom: 12 },
  paymentTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4, textAlign: 'center' },
  paymentRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, minHeight: 18 },
  paymentFirstRow: { borderTopWidth: 1 },
  paymentLabel: { width: '45%', padding: 4, borderRightWidth: 1, borderColor: colors.black, fontWeight: 500 },
  paymentValue: { flex: 1, padding: 4 },

  // Signature rows
  signatureBlock: { marginBottom: 18 },
  signatureRow: { flexDirection: 'row', alignItems: 'center' },
  signatureLabel: { width: 170, fontWeight: 700 },
  signatureColon: { width: 10 },
  signatureValue: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  signatureName: { fontSize: 10, marginRight: 8 },
  signatureText: { fontSize: 16, color: '#1a365d' },
  signaturePending: { fontSize: 9, color: colors.muted },
  signatureNoteRow: { paddingLeft: 180, marginTop: 3 },
  signatureNoteText: { fontSize: 8, color: colors.muted },

  // Final approval (physical signature by company owner)
  finalApprovalBlock: { marginTop: 30, alignItems: 'center' },
  finalApprovalLabel: { fontSize: 11, fontWeight: 700, marginBottom: 14 },
  finalApprovalName: { fontSize: 11, fontWeight: 700 },
});

interface SignatureInfo { text: string; font: SignatureFont; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ApprovalLetterPDFTemplateProps {
  request: any;
  requester: any;
  approvalLetterRequest: any;
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}

export const ApprovalLetterPDFTemplate: React.FC<ApprovalLetterPDFTemplateProps> = ({
  requester,
  approvalLetterRequest,
  approvals,
  signatures = {},
}) => {
  const renderSignature = (employeeId: string) => {
    const sig = signatures[employeeId];
    if (sig) {
      return <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    }
    return <Text style={styles.signaturePending}>İmza</Text>;
  };

  const getApprovalColumns = () => {
    const columns: { title: string; name: string; employeeId: string; note: string }[] = [
      { title: 'Hazırlayan', name: `${requester.first_name} ${requester.last_name}`, employeeId: requester.id, note: '' },
    ];
    const sortedApprovals = approvals
      .filter((a) => a.workflow_step.step_order > 1)
      .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);
    sortedApprovals.forEach((approval) => {
      const positionTitle = approval.workflow_step.static_position
        ? approval.workflow_step.static_position.title
        : approval.workflow_step.name;
      columns.push({
        title: positionTitle,
        name: `${approval.approver.first_name} ${approval.approver.last_name}`,
        employeeId: approval.approver.id,
        note: approval.comment || '',
      });
    });
    return columns;
  };

  const approvalColumns = getApprovalColumns();
  const letter = approvalLetterRequest;
  const paidAmounts: string[] = letter.paid_amounts || [];
  const contentItems: string[] = (letter.content || '')
    .split(/\r?\n/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo Header */}
        <View style={styles.headerContainer}>
          <Image src={getLogoPath()} style={styles.logoImage} />
        </View>
        <View style={styles.headerDivider} />

        {/* Yazı Bilgileri */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tarih</Text>
          <Text style={styles.infoColon}>:</Text>
          <Text style={styles.infoValue}>{format(new Date(letter.letter_date), 'dd.MM.yyyy')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Firma / Proje</Text>
          <Text style={styles.infoColon}>:</Text>
          <Text style={styles.infoValue}>{letter.company} / {letter.project}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Konu</Text>
          <Text style={styles.infoColon}>:</Text>
          <Text style={styles.infoValue}>{letter.subject}</Text>
        </View>

        <Text style={styles.intro}>Yukarıda belirtilen firmamız/projemiz kapsamında;</Text>

        {/* Numaralı İçerik */}
        {contentItems.map((item, idx) => (
          <View key={idx} style={styles.listItem}>
            <Text style={styles.listNumber}>{idx + 1}.</Text>
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}

        {/* Ödeme Tablosu (opsiyonel) */}
        {letter.has_payment_table && (
          <View style={styles.paymentSection}>
            <Text style={styles.paymentTitle}>ÖDEME TABLOSU</Text>
            <View style={[styles.paymentRow, styles.paymentFirstRow]}>
              <Text style={styles.paymentLabel}>Karşılaştırma Onay Tarihi</Text>
              <Text style={styles.paymentValue}>{letter.comparison_approval_date ? format(new Date(letter.comparison_approval_date), 'dd.MM.yyyy') : '-'}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Anlaşma Tutarı</Text>
              <Text style={styles.paymentValue}>{letter.agreement_amount || '-'}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Sözleşme</Text>
              <Text style={styles.paymentValue}>{letter.has_contract ? 'VAR' : 'YOK'}</Text>
            </View>
            {paidAmounts.map((amount: string, idx: number) => (
              <View key={idx} style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Ödenen ({idx + 1})</Text>
                <Text style={styles.paymentValue}>{amount || '-'}</Text>
              </View>
            ))}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Kalan Ödeme</Text>
              <Text style={styles.paymentValue}>{letter.remaining_payment || '-'}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Ödenmesi Talep Edilen Tutar</Text>
              <Text style={styles.paymentValue}>{letter.requested_payment_amount || '-'}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Bu Ödeme Sonrası Kalan Ödeme</Text>
              <Text style={styles.paymentValue}>{letter.remaining_after_payment || '-'}</Text>
            </View>
          </View>
        )}

        <Text style={styles.outro}>Belirtilen konuyla ilgili işlemleri onaylarınıza arz ederim.</Text>

        {/* İmza Satırları */}
        {approvalColumns.map((col, index) => (
          <View key={index} style={styles.signatureBlock}>
            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>{col.title}</Text>
              <Text style={styles.signatureColon}>:</Text>
              <View style={styles.signatureValue}>
                <Text style={styles.signatureName}>{col.name}</Text>
                {renderSignature(col.employeeId)}
              </View>
            </View>
            {col.note ? (
              <View style={styles.signatureNoteRow}>
                <Text style={styles.signatureNoteText}>{col.note}</Text>
              </View>
            ) : null}
          </View>
        ))}

        {/* Fiziksel onay - şirket sahibi (sistem dışı) */}
        <View style={styles.finalApprovalBlock}>
          <Text style={styles.finalApprovalLabel}>ONAY</Text>
          <Text style={styles.finalApprovalName}>RAMAZAN TAŞ</Text>
        </View>
      </Page>
    </Document>
  );
};
