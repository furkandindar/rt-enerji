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

const signatureFontMap: Record<SignatureFont, string> = { 'Ballet': 'Ballet', 'Great Vibes': 'Great Vibes', 'Sacramento': 'Sacramento' };

const colors = { orange: '#F97316', orangeLight: '#FFECD2', black: '#000000', white: '#FFFFFF' };

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
  mainContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  leftColumn: { width: '50%', borderRightWidth: 1, borderColor: colors.black },
  rightColumn: { width: '50%' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 22 },
  tableRowLast: { flexDirection: 'row', minHeight: 22 },
  labelCell: { width: '45%', backgroundColor: colors.orangeLight, padding: 5, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  valueCell: { width: '55%', padding: 5, justifyContent: 'center' },
  labelText: { fontSize: 8, fontWeight: 500 },
  valueText: { fontSize: 8 },
  // Staff shortage table
  entriesSection: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  entriesHeader: { flexDirection: 'row', backgroundColor: colors.orangeLight, borderBottomWidth: 1, borderColor: colors.black },
  entriesHeaderCell: { padding: 5, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  entriesHeaderCellLast: { padding: 5, justifyContent: 'center' },
  entriesHeaderText: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
  entriesRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 20 },
  entriesRowLast: { flexDirection: 'row', minHeight: 20 },
  entriesCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  entriesCellLast: { padding: 4, justifyContent: 'center' },
  entriesCellText: { fontSize: 8, textAlign: 'center' },
  totalsRow: { flexDirection: 'row', backgroundColor: colors.orangeLight, minHeight: 22 },
  totalsLabel: { flex: 1, padding: 5, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  totalsValue: { padding: 5, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', width: 80 },
  totalsValueLast: { padding: 5, justifyContent: 'center', width: 100 },
  totalsText: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
  // HR Note
  noteSection: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, padding: 6, minHeight: 30 },
  noteLabel: { fontSize: 8, fontWeight: 700, marginBottom: 3 },
  noteText: { fontSize: 8 },
  // Approval section
  onayHeader: { backgroundColor: colors.orange, padding: 4, borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  onayHeaderText: { color: colors.white, fontSize: 9, fontWeight: 700, textAlign: 'center' },
  onayContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  onayColumn: { flex: 1, borderRightWidth: 1, borderColor: colors.black },
  onayColumnLast: { flex: 1 },
  onayTitleRow: { backgroundColor: colors.orangeLight, padding: 4, borderBottomWidth: 1, borderColor: colors.black, minHeight: 22, justifyContent: 'center', alignItems: 'center' },
  onayTitleText: { fontSize: 7, fontWeight: 700, textAlign: 'center' },
  onaySignatureRow: { padding: 4, minHeight: 35, justifyContent: 'center', alignItems: 'center', gap: 2 },
  onayNameText: { fontSize: 7, textAlign: 'center', marginBottom: 2 },
  footer: { marginTop: 10, fontSize: 6, color: '#666' },
  footerText: { marginBottom: 2 },
  signatureText: { fontSize: 14, color: '#1a365d' },
  signatureStatus: { fontSize: 7, color: '#666' },
});

const overtimeTypeLabels: Record<string, string> = { EMERGENCY: 'Acil Durum / Talep Üzerine', STAFF_SHORTAGE: 'Personel Eksikliği / Raporlama' };
const reasonCategoryLabels: Record<string, string> = {
  SHIFT_OUTSIDE: 'Vardiya Dışı Çalışma', NON_CONTINUOUS: 'Aralıklı Çalışma', EMERGENCY_CASE: 'Acil Durum',
  SUDDEN_DEVELOPMENT: 'Ani Gelişme', ON_REQUEST: 'Talep Üzerine', STAFF_SHORTAGE: 'Personel Eksikliği',
  REPORTING: 'Raporlama', ENERGY_PRODUCTION: 'Enerji Üretimi'
};

interface SignatureInfo { text: string; font: SignatureFont; }
interface OvertimeEntry { id: string; role_title: string; overtime_hours: number; overtime_pay: number; }
interface OvertimePDFTemplateProps {
  request: any;
  requester: any;
  overtimeRequest: any;
  entries?: OvertimeEntry[];
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}

export const OvertimePDFTemplate: React.FC<OvertimePDFTemplateProps> = ({
  request, requester, overtimeRequest, entries = [], approvals, signatures = {},
}) => {
  const renderSignature = (employeeId: string) => {
    const sig = signatures[employeeId];
    if (sig) return <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return <Text style={styles.signatureStatus}>İmza</Text>;
  };

  const getApprovalColumns = () => {
    const columns = [{ title: 'İnsan Kaynakları', name: `${requester.first_name} ${requester.last_name}`, employeeId: requester.id }];
    const sortedApprovals = approvals.filter((a) => a.workflow_step.step_order > 1).sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);
    sortedApprovals.forEach((approval) => {
      const positionTitle = approval.workflow_step.static_position ? approval.workflow_step.static_position.title : approval.workflow_step.name;
      columns.push({ title: positionTitle, name: `${approval.approver.first_name} ${approval.approver.last_name}`, employeeId: approval.approver.id });
    });
    return columns;
  };

  const approvalColumns = getApprovalColumns();
  const isEmergency = overtimeRequest.overtime_type === 'EMERGENCY';
  const actualEntries = overtimeRequest.entries || entries || [];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>FAZLA MESAİ ONAY FORMU</Text></View>
          <View style={styles.logoRightCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
        </View>

        {/* GENEL BİLGİLER */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>GENEL BİLGİLER</Text></View>
        <View style={styles.mainContent}>
          <View style={styles.leftColumn}>
            <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Fazla Mesai Tipi</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeTypeLabels[overtimeRequest.overtime_type]}</Text></View></View>
            <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Dönem</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.month} {overtimeRequest.year}</Text></View></View>
            <View style={styles.tableRowLast}><View style={styles.labelCell}><Text style={styles.labelText}>Neden Kategorisi</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{reasonCategoryLabels[overtimeRequest.reason_category]}</Text></View></View>
          </View>
          <View style={styles.rightColumn}>
            <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Talep Tarihi</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{format(new Date(request.created_at), 'dd/MM/yyyy')}</Text></View></View>
            <View style={styles.tableRowLast}><View style={{...styles.labelCell, width: '45%'}}><Text style={styles.labelText}>Talep Eden Kişi/Durum</Text></View><View style={{...styles.valueCell, width: '55%'}}><Text style={styles.valueText}>{overtimeRequest.reason_detail}</Text></View></View>
          </View>
        </View>

        {/* EMERGENCY - Çalışma Detayları */}
        {isEmergency && (
          <>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>ÇALIŞMA DETAYLARI</Text></View>
            <View style={styles.mainContent}>
              <View style={styles.leftColumn}>
                <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Çalışma Yeri</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.work_location || '-'}</Text></View></View>
                <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Çalışma Başlangıç</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.work_start_date ? format(new Date(overtimeRequest.work_start_date), 'dd/MM/yyyy HH:mm') : '-'}</Text></View></View>
                <View style={styles.tableRowLast}><View style={styles.labelCell}><Text style={styles.labelText}>Çalışma Bitiş</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.work_end_date ? format(new Date(overtimeRequest.work_end_date), 'dd/MM/yyyy HH:mm') : '-'}</Text></View></View>
              </View>
              <View style={styles.rightColumn}>
                <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Önceki Mesai Saati</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.previous_shift || '-'}</Text></View></View>
                <View style={styles.tableRow}><View style={styles.labelCell}><Text style={styles.labelText}>Sonraki Mesai Saati</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.next_shift || '-'}</Text></View></View>
                <View style={styles.tableRowLast}><View style={styles.labelCell}><Text style={styles.labelText}>Çalışma Nedeni</Text></View><View style={styles.valueCell}><Text style={styles.valueText}>{overtimeRequest.work_reason || '-'}</Text></View></View>
              </View>
            </View>
          </>
        )}

        {/* STAFF_SHORTAGE - Çalışan Listesi */}
        {!isEmergency && actualEntries.length > 0 && (
          <>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>ÇALIŞAN LİSTESİ</Text></View>
            <View style={styles.entriesSection}>
              <View style={styles.entriesHeader}>
                <View style={{...styles.entriesHeaderCell, flex: 1}}><Text style={styles.entriesHeaderText}>Rol / Unvan</Text></View>
                <View style={{...styles.entriesHeaderCell, width: 80}}><Text style={styles.entriesHeaderText}>FM Saati</Text></View>
                <View style={{...styles.entriesHeaderCellLast, width: 100}}><Text style={styles.entriesHeaderText}>Ücret (TL)</Text></View>
              </View>
              {actualEntries.map((entry: OvertimeEntry, index: number) => (
                <View key={entry.id} style={index === actualEntries.length - 1 ? styles.entriesRowLast : styles.entriesRow}>
                  <View style={{...styles.entriesCell, flex: 1}}><Text style={styles.entriesCellText}>{entry.role_title}</Text></View>
                  <View style={{...styles.entriesCell, width: 80}}><Text style={styles.entriesCellText}>{entry.overtime_hours} saat</Text></View>
                  <View style={{...styles.entriesCellLast, width: 100}}><Text style={styles.entriesCellText}>{entry.overtime_pay.toLocaleString('tr-TR')} TL</Text></View>
                </View>
              ))}
              <View style={styles.totalsRow}>
                <View style={styles.totalsLabel}><Text style={styles.totalsText}>TOPLAM</Text></View>
                <View style={styles.totalsValue}><Text style={styles.totalsText}>{overtimeRequest.total_hours || 0} saat</Text></View>
                <View style={styles.totalsValueLast}><Text style={styles.totalsText}>{(overtimeRequest.total_pay || 0).toLocaleString('tr-TR')} TL</Text></View>
              </View>
            </View>
          </>
        )}

        {/* İK Notu */}
        {overtimeRequest.hr_note && (
          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>İK Notu:</Text>
            <Text style={styles.noteText}>{overtimeRequest.hr_note}</Text>
          </View>
        )}

        {/* ONAY */}
        <View style={styles.onayHeader}><Text style={styles.onayHeaderText}>ONAY</Text></View>
        <View style={styles.onayContent}>
          {approvalColumns.map((col, index) => (
            <View key={index} style={index === approvalColumns.length - 1 ? styles.onayColumnLast : styles.onayColumn}>
              <View style={styles.onayTitleRow}><Text style={styles.onayTitleText}>{col.title}</Text></View>
              <View style={styles.onaySignatureRow}><Text style={styles.onayNameText}>{col.name}</Text>{renderSignature(col.employeeId)}</View>
            </View>
          ))}
        </View>

        <View style={styles.footer}><Text style={styles.footerText}>Tüm Formlar SharePoint/İK/Formlar dosyasına kaydedilir.</Text></View>
      </Page>
    </Document>
  );
};

