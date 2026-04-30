import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import path from 'path';

const getLogoPath = () => {
  return path.join(process.cwd(), 'public', 'logo.png');
};

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
  tableContainer: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 24 },
  tableRowLast: { flexDirection: 'row', minHeight: 24 },
  labelCell: { width: '35%', backgroundColor: colors.orangeLight, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  valueCell: { width: '65%', padding: 6, justifyContent: 'center' },
  labelText: { fontSize: 9, fontWeight: 500 },
  valueText: { fontSize: 9 },
  halfRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 24 },
  halfLabelCell: { width: '17.5%', backgroundColor: colors.orangeLight, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  halfValueCell: { width: '32.5%', padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  halfValueCellLast: { width: '32.5%', padding: 6, justifyContent: 'center' },
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

interface TravelAssignmentPDFTemplateProps {
  request: any;
  requester: any;
  travelAssignmentRequest: any;
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}

const transportationLabels: Record<string, string> = {
  COMPANY_VEHICLE: 'Şirket Aracı',
  RENTAL_VEHICLE: 'Kiralık Araç',
  AIRPLANE: 'Uçak',
  OTHER: 'Diğer',
};

export const TravelAssignmentPDFTemplate: React.FC<TravelAssignmentPDFTemplateProps> = ({
  request,
  requester,
  travelAssignmentRequest,
  approvals,
  signatures = {},
}) => {
  const renderSignature = (employeeId: string, status?: string) => {
    if (status === 'REJECTED') {
      return <Text style={{ fontSize: 9, fontWeight: 700, color: '#DC2626' }}>Reddedildi</Text>;
    }
    const sig = signatures[employeeId];
    if (sig) {
      return <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    }
    return <Text style={styles.signatureStatus}>İmza</Text>;
  };

  const getRequesterPosition = () => {
    if (!requester?.employee_positions) return '-';
    const primaryPosition = requester.employee_positions.find((ep: any) => ep.is_primary && !ep.end_date);
    return primaryPosition?.position?.title || '-';
  };

  const getApprovalColumns = () => {
    const columns: { title: string; name: string; employeeId: string; note: string; status?: string }[] = [
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
        status: approval.status,
      });
    });
    return columns;
  };

  const approvalColumns = getApprovalColumns();
  const tr = travelAssignmentRequest;
  const companyName = tr?.company?.name || '-';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>ŞEHİR İÇİ/DIŞI GÖREV FORMU</Text></View>
          <View style={styles.logoRightCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
        </View>

        {/* PERSONEL BİLGİLERİ */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>PERSONEL BİLGİLERİ</Text></View>
        <View style={styles.tableContainer}>
          <View style={styles.tableRow}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Adı / Soyadı</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{requester.first_name} {requester.last_name}</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Şirket</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{companyName}</Text></View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Görev Unvanı</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{getRequesterPosition()}</Text></View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Form Tarihi</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{format(new Date(request.created_at), 'dd/MM/yyyy')}</Text></View>
          </View>
        </View>

        {/* GÖREV BİLGİLERİ */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>GÖREV BİLGİLERİ</Text></View>
        <View style={styles.tableContainer}>
          <View style={styles.tableRow}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Görev Konusu</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{tr?.assignment_subject || '-'}</Text></View>
          </View>
          <View style={styles.halfRow}>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Görev Şehri</Text></View>
            <View style={styles.halfValueCell}><Text style={styles.valueText}>{tr?.destination_city || '-'}</Text></View>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Görev Kurumu</Text></View>
            <View style={styles.halfValueCellLast}><Text style={styles.valueText}>{tr?.destination_institution || '-'}</Text></View>
          </View>
          <View style={styles.halfRow}>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Tahmini Çıkış</Text></View>
            <View style={styles.halfValueCell}><Text style={styles.valueText}>{tr?.estimated_departure_at ? format(new Date(tr.estimated_departure_at), 'dd/MM/yyyy HH:mm') : '-'}</Text></View>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Tahmini Dönüş</Text></View>
            <View style={styles.halfValueCellLast}><Text style={styles.valueText}>{tr?.estimated_return_at ? format(new Date(tr.estimated_return_at), 'dd/MM/yyyy HH:mm') : '-'}</Text></View>
          </View>
          <View style={styles.halfRow}>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Ulaşım Aracı</Text></View>
            <View style={styles.halfValueCell}><Text style={styles.valueText}>{transportationLabels[tr?.transportation_type] || '-'}</Text></View>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Ulaşım Bedeli</Text></View>
            <View style={styles.halfValueCellLast}><Text style={styles.valueText}>{tr?.transportation_cost?.toLocaleString('tr-TR') || '0'} TL</Text></View>
          </View>
          <View style={styles.halfRow}>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Konaklama</Text></View>
            <View style={styles.halfValueCell}><Text style={styles.valueText}>{tr?.accommodation_needed ? 'Var' : 'Yok'}</Text></View>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Konaklama Bedeli</Text></View>
            <View style={styles.halfValueCellLast}><Text style={styles.valueText}>{tr?.accommodation_needed ? `${tr?.accommodation_cost?.toLocaleString('tr-TR') || '0'} TL` : '-'}</Text></View>
          </View>
          <View style={styles.tableRowLast}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Avans Talebi</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{tr?.advance_requested ? 'Var' : 'Yok'}</Text></View>
          </View>
        </View>

        {/* GERÇEKLEŞEN TARİHLER */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>GERÇEKLEŞEN TARİHLER</Text></View>
        <View style={styles.tableContainer}>
          <View style={styles.halfRow}>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Gidiş Tarihi</Text></View>
            <View style={styles.halfValueCell}><Text style={styles.valueText}>{tr?.actual_departure_at ? format(new Date(tr.actual_departure_at), 'dd/MM/yyyy HH:mm') : '—'}</Text></View>
            <View style={styles.halfLabelCell}><Text style={styles.labelText}>Dönüş Tarihi</Text></View>
            <View style={styles.halfValueCellLast}><Text style={styles.valueText}>{tr?.actual_return_at ? format(new Date(tr.actual_return_at), 'dd/MM/yyyy HH:mm') : '—'}</Text></View>
          </View>
        </View>

        {/* ONAY */}
        <View style={styles.onayHeader}><Text style={styles.onayHeaderText}>ONAY</Text></View>
        <View style={styles.onayContent}>
          {approvalColumns.map((col, index) => (
            <View key={index} style={index === approvalColumns.length - 1 ? styles.onayColumnLast : styles.onayColumn}>
              <View style={styles.onayTitleRow}><Text style={styles.onayTitleText}>{col.title}</Text></View>
              <View style={styles.onaySignatureRow}>
                <Text style={styles.onayNameText}>{col.name}</Text>
                {renderSignature(col.employeeId, col.status)}
              </View>
              {col.note ? (<View style={styles.onayNoteRow}><Text style={styles.onayNoteText}>{col.note}</Text></View>) : null}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Tüm Formlar SharePoint/İK/Formlar dosyasına kaydedilir.</Text>
        </View>
      </Page>
    </Document>
  );
};
