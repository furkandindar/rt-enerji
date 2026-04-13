import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import path from 'path';

const getLogoPath = () => path.join(process.cwd(), 'public', 'logo.png');

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
  orange: '#F97316',
  orangeLight: '#FFECD2',
  black: '#000000',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: 'Roboto', backgroundColor: colors.white },
  headerContainer: { flexDirection: 'row', borderWidth: 1, borderColor: colors.black },
  logoCell: { width: 70, padding: 8, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  logoImage: { width: 45, height: 45 },
  titleCell: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 8 },
  titleText: { fontSize: 14, fontWeight: 700 },
  logoRightCell: { width: 70, padding: 8, borderLeftWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { backgroundColor: colors.orange, padding: 4, borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  sectionHeaderText: { color: colors.white, fontSize: 9, fontWeight: 700, textAlign: 'center' },
  tableRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, minHeight: 24 },
  labelCell: { width: '30%', backgroundColor: colors.orangeLight, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  valueCell: { width: '70%', padding: 6, justifyContent: 'center' },
  labelText: { fontSize: 9, fontWeight: 500 },
  valueText: { fontSize: 9 },
  contentBox: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, padding: 10, minHeight: 80 },
  contentText: { fontSize: 9, lineHeight: 1.6 },
  // Ödeme tablosu
  paymentLabelCell: { width: '40%', backgroundColor: colors.orangeLight, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  paymentValueCell: { width: '60%', padding: 6, justifyContent: 'center' },
  // Onay
  onayHeader: { backgroundColor: colors.orange, padding: 4, borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  onayHeaderText: { color: colors.white, fontSize: 9, fontWeight: 700, textAlign: 'center' },
  onayContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  onayColumn: { flex: 1, borderRightWidth: 1, borderColor: colors.black },
  onayColumnLast: { flex: 1 },
  onayTitleRow: { backgroundColor: colors.orangeLight, padding: 4, borderBottomWidth: 1, borderColor: colors.black, minHeight: 22, justifyContent: 'center', alignItems: 'center' },
  onayTitleText: { fontSize: 7, fontWeight: 700, textAlign: 'center' },
  onaySignatureRow: { padding: 4, borderBottomWidth: 1, borderColor: colors.white, minHeight: 35, justifyContent: 'center', alignItems: 'center', gap: 2 },
  onayNameText: { fontSize: 7, textAlign: 'center', marginBottom: 2 },
  onayNoteRow: { padding: 4, minHeight: 20 },
  onayNoteText: { fontSize: 5.5, color: '#666', lineHeight: 1.3 },
  footer: { marginTop: 10, fontSize: 6, color: '#666' },
  footerText: { marginBottom: 2 },
  signatureText: { fontSize: 14, color: '#1a365d' },
  signatureStatus: { fontSize: 7, color: '#666' },
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
  request,
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
    return <Text style={styles.signatureStatus}>İmza</Text>;
  };

  const getApprovalColumns = () => {
    const columns: { title: string; name: string; employeeId: string; note: string }[] = [
      { title: 'Talep Eden', name: `${requester.first_name} ${requester.last_name}`, employeeId: requester.id, note: '' },
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>OLUR YAZISI</Text></View>
          <View style={styles.logoRightCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
        </View>

        {/* YAZI BİLGİLERİ */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>YAZI BİLGİLERİ</Text></View>
        <View style={styles.tableRow}>
          <View style={styles.labelCell}><Text style={styles.labelText}>Tarih</Text></View>
          <View style={styles.valueCell}><Text style={styles.valueText}>{format(new Date(letter.letter_date), 'dd.MM.yyyy')}</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={styles.labelCell}><Text style={styles.labelText}>Firma</Text></View>
          <View style={styles.valueCell}><Text style={styles.valueText}>{letter.company}</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={styles.labelCell}><Text style={styles.labelText}>Proje</Text></View>
          <View style={styles.valueCell}><Text style={styles.valueText}>{letter.project}</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={styles.labelCell}><Text style={styles.labelText}>Konu</Text></View>
          <View style={styles.valueCell}><Text style={styles.valueText}>{letter.subject}</Text></View>
        </View>

        {/* Yazı İçeriği */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>YAZI</Text></View>
        <View style={styles.contentBox}>
          <Text style={styles.contentText}>{letter.content}</Text>
        </View>

        {/* Ödeme Tablosu (opsiyonel) */}
        {letter.has_payment_table && (
          <>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>ÖDEME TABLOSU</Text></View>
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>KARŞILAŞTIRMA ONAY TARİHİ:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.comparison_approval_date ? format(new Date(letter.comparison_approval_date), 'dd.MM.yyyy') : '-'}</Text></View>
            </View>
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>ANLAŞMA TUTARI:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.agreement_amount || '-'}</Text></View>
            </View>
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>SÖZLEŞME VAR/YOK:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.has_contract ? 'VAR' : 'YOK'}</Text></View>
            </View>
            {paidAmounts.map((amount: string, idx: number) => (
              <View key={idx} style={styles.tableRow}>
                <View style={styles.paymentLabelCell}><Text style={styles.labelText}>ÖDENEN ({idx + 1}):</Text></View>
                <View style={styles.paymentValueCell}><Text style={styles.valueText}>{amount || '-'}</Text></View>
              </View>
            ))}
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>KALAN ÖDEME:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.remaining_payment || '-'}</Text></View>
            </View>
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>ÖDENMESİ TALEP EDİLEN TUTAR:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.requested_payment_amount || '-'}</Text></View>
            </View>
            <View style={styles.tableRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.labelText}>BU ÖDEME SONRASI KALAN ÖDEME:</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.valueText}>{letter.remaining_after_payment || '-'}</Text></View>
            </View>
          </>
        )}

        {/* ONAY */}
        <View style={styles.onayHeader}><Text style={styles.onayHeaderText}>ONAY</Text></View>
        <View style={styles.onayContent}>
          {approvalColumns.map((col, index) => (
            <View key={index} style={index === approvalColumns.length - 1 ? styles.onayColumnLast : styles.onayColumn}>
              <View style={styles.onayTitleRow}><Text style={styles.onayTitleText}>{col.title}</Text></View>
              <View style={styles.onaySignatureRow}>
                <Text style={styles.onayNameText}>{col.name}</Text>
                {renderSignature(col.employeeId)}
              </View>
              {col.note ? (<View style={styles.onayNoteRow}><Text style={styles.onayNoteText}>{col.note}</Text></View>) : null}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Oluşturulma: {format(new Date(request.created_at), 'dd.MM.yyyy HH:mm')}</Text>
        </View>
      </Page>
    </Document>
  );
};
