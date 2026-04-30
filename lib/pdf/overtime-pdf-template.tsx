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

const signatureFontMap: Record<SignatureFont, string> = { 'Ballet': 'Ballet', 'Great Vibes': 'Great Vibes', 'Sacramento': 'Sacramento' };

const staffStyles = StyleSheet.create({
  page: { padding: 40, paddingTop: 20, fontSize: 9, fontFamily: 'Roboto', backgroundColor: '#FFFFFF' },
  logoContainer: { alignItems: 'center', marginBottom: 8 },
  logo: { width: 168, height: 37 },
  divider: { borderBottomWidth: 2, borderColor: '#F97316', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 10 },
  subjectText: { fontSize: 10, marginBottom: 4 },
  bodyText: { fontSize: 9, marginBottom: 10, lineHeight: 1.5 },
  rightBlock: { alignItems: 'flex-end', marginBottom: 14 },
  rightLabel: { fontSize: 9, fontWeight: 700 },
  rightName: { fontSize: 9 },
  table: { borderWidth: 1, borderColor: '#000000', marginBottom: 10 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#F97316' },
  tableHeaderCell: { padding: 5, borderRightWidth: 1, borderColor: '#000000', justifyContent: 'center' },
  tableHeaderCellLast: { padding: 5, justifyContent: 'center' },
  tableHeaderText: { color: '#FFFFFF', fontSize: 8, fontWeight: 700, textAlign: 'center' },
  tableDataRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#000000' },
  tableDataCell: { padding: 5, borderRightWidth: 1, borderColor: '#000000', justifyContent: 'center' },
  tableDataCellLast: { padding: 5, justifyContent: 'center' },
  tableDataText: { fontSize: 8, textAlign: 'center' },
  tableTotalsRow: { flexDirection: 'row', backgroundColor: '#FFECD2', borderTopWidth: 1, borderColor: '#000000' },
  tableTotalsText: { fontSize: 8, fontWeight: 700, textAlign: 'center', padding: 5 },
  noteBlock: { marginBottom: 8 },
  noteLabel: { fontSize: 8, fontWeight: 700, marginBottom: 2 },
  noteText: { fontSize: 8 },
  onayHeader: { backgroundColor: '#F97316', padding: 4, borderWidth: 1, borderColor: '#000000', marginTop: 4 },
  onayHeaderText: { color: '#FFFFFF', fontSize: 9, fontWeight: 700, textAlign: 'center' },
  onayContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#000000' },
  onayColumn: { flex: 1, borderRightWidth: 1, borderColor: '#000000' },
  onayColumnLast: { flex: 1 },
  onayTitleRow: { backgroundColor: '#FFECD2', padding: 4, borderBottomWidth: 1, borderColor: '#000000', minHeight: 22, justifyContent: 'center', alignItems: 'center' },
  onayTitleText: { fontSize: 7, fontWeight: 700, textAlign: 'center' },
  onaySignatureRow: { padding: 4, minHeight: 40, justifyContent: 'center', alignItems: 'center', gap: 2 },
  onayNameText: { fontSize: 7, textAlign: 'center' },
  onayNoteRow: { padding: 4, minHeight: 20 },
  onayNoteText: { fontSize: 5.5, color: '#666', lineHeight: 1.3 },
  onaySignatureText: { fontSize: 14, color: '#1a365d' },
  onaySignatureStatus: { fontSize: 7, color: '#666' },
  onaySignatureRejected: { fontSize: 9, fontWeight: 700, color: '#DC2626' },
  footer: { marginTop: 10, fontSize: 6, color: '#666' },
  // Emergency field rows
  fieldTable: { borderWidth: 1, borderColor: '#000000', marginBottom: 10 },
  fieldRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000000', minHeight: 24 },
  fieldRowLast: { flexDirection: 'row', minHeight: 24 },
  fieldLabel: { width: '38%', backgroundColor: '#FFECD2', padding: 5, borderRightWidth: 1, borderColor: '#000000', justifyContent: 'center' },
  fieldValue: { flex: 1, padding: 5, justifyContent: 'center' },
  fieldLabelText: { fontSize: 8, fontWeight: 700 },
  fieldValueText: { fontSize: 9 },
  shiftGroup: { marginBottom: 8 },
  shiftGroupTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4, color: '#F97316' },
});

const reasonCategoryLabels: Record<string, string> = {
  SHIFT_OUTSIDE: 'Vardiya Dışı', NON_CONTINUOUS: 'Sürekli Olmayan', EMERGENCY_CASE: 'Acil Durum',
  SUDDEN_DEVELOPMENT: 'Ani Gelişme', ON_REQUEST: 'Talep Üzerine', STAFF_SHORTAGE: 'Personel Eksikliği',
  REPORTING: 'Raporlama', ENERGY_PRODUCTION: 'Enerji Üretimi'
};

interface SignatureInfo { text: string; font: SignatureFont; }
interface OvertimeEntry { id: string; full_name: string; role_title: string; overtime_hours: number; overtime_pay: number; }
interface OvertimePDFTemplateProps {
  request: any;
  requester: any;
  overtimeRequest: any;
  entries?: OvertimeEntry[];
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}

const MONTH_NAMES: Record<string, string> = {
  '1': 'Ocak', '2': 'Şubat', '3': 'Mart', '4': 'Nisan', '5': 'Mayıs', '6': 'Haziran',
  '7': 'Temmuz', '8': 'Ağustos', '9': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık',
};

interface StaffShortageProps {
  request: any;
  requester: any;
  overtimeRequest: any;
  entries: OvertimeEntry[];
  approvalColumns: { title: string; name: string; employeeId: string; note: string; status?: string }[];
  signatures: Record<string, SignatureInfo>;
}

const StaffShortagePDF: React.FC<StaffShortageProps> = ({
  request, requester, overtimeRequest, entries, approvalColumns, signatures,
}) => {
  const renderSig = (employeeId: string, status?: string) => {
    if (status === 'REJECTED') return <Text style={staffStyles.onaySignatureRejected}>Reddedildi</Text>;
    const sig = signatures[employeeId];
    if (sig) return <Text style={[staffStyles.onaySignatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return <Text style={staffStyles.onaySignatureStatus}>İmza</Text>;
  };

  const monthName = MONTH_NAMES[String(overtimeRequest.month)] || String(overtimeRequest.month);
  const requestDate = format(new Date(request.created_at), 'dd/MM/yyyy');
  const locationLabel = overtimeRequest.work_location || 'Merkez, Şube ve İşletmeler';

  return (
    <Page size="A4" style={staffStyles.page}>
      <View style={staffStyles.logoContainer}><Image src={getLogoPath()} style={staffStyles.logo} /></View>
      <View style={staffStyles.divider} />
      <Text style={staffStyles.title}>FAZLA MESAİ ONAY FORMU</Text>
      <Text style={staffStyles.subjectText}>Konu: Fazla Mesai Çalışmaları</Text>
      <Text style={staffStyles.subjectText}>MERKEZ, ŞUBE ve İŞLETMELER</Text>
      {/* {overtimeRequest.work_location && <Text style={staffStyles.subjectText}>{overtimeRequest.work_location}</Text>} */}
      <Text style={[staffStyles.subjectText, { marginBottom: 12 }]}>Personel Eksikliği, Raporlama, 7/24 Enerji Üretimi</Text>
      {/* <Text style={[staffStyles.subjectText, { marginBottom: 12 }]}>{reasonCategoryLabels[overtimeRequest.reason_category] || overtimeRequest.reason_category}</Text> */}
      <Text style={staffStyles.bodyText}>
        {reasonCategoryLabels[overtimeRequest.reason_category] || overtimeRequest.reason_category}{' nedeniyle oluşan '}{overtimeRequest.year}{' yılı '}{monthName}{' ayına ilişkin FAZLA MESAİ çalışmalarının ödenmesini onayınıza sunarım.\n'}{requestDate}
      </Text>
      <View style={staffStyles.rightBlock}>
        <Text style={staffStyles.rightLabel}>İnsan Kaynakları</Text>
        <Text style={staffStyles.rightName}>{requester.first_name} {requester.last_name}</Text>
        {renderSig(requester.id)}
      </View>

      {entries.length > 0 && (
        <View style={staffStyles.table}>
          <View style={staffStyles.tableHeaderRow}>
            <View style={[staffStyles.tableHeaderCell, { flex: 2 }]}><Text style={staffStyles.tableHeaderText}>{locationLabel}</Text></View>
            <View style={[staffStyles.tableHeaderCell, { flex: 2 }]}><Text style={staffStyles.tableHeaderText}>Ad Soyad</Text></View>
            <View style={[staffStyles.tableHeaderCell, { width: 80 }]}><Text style={staffStyles.tableHeaderText}>FM Saati</Text></View>
            <View style={[staffStyles.tableHeaderCellLast, { width: 120 }]}><Text style={staffStyles.tableHeaderText}>Fazla Mesai Ücret Karşılığı</Text></View>
          </View>
          {entries.map((entry) => (
            <View key={entry.id} style={staffStyles.tableDataRow}>
              <View style={[staffStyles.tableDataCell, { flex: 2 }]}><Text style={staffStyles.tableDataText}>{entry.role_title}</Text></View>
              <View style={[staffStyles.tableDataCell, { flex: 2 }]}><Text style={staffStyles.tableDataText}>{entry.full_name}</Text></View>
              <View style={[staffStyles.tableDataCell, { width: 80 }]}><Text style={staffStyles.tableDataText}>{entry.overtime_hours} saat</Text></View>
              <View style={[staffStyles.tableDataCellLast, { width: 120 }]}><Text style={staffStyles.tableDataText}>{entry.overtime_pay.toLocaleString('tr-TR')} TL</Text></View>
            </View>
          ))}
          <View style={staffStyles.tableTotalsRow}>
            <View style={[staffStyles.tableDataCell, { flex: 4 }]}><Text style={staffStyles.tableTotalsText}>TOPLAM</Text></View>
            <View style={[staffStyles.tableDataCell, { width: 80 }]}><Text style={staffStyles.tableTotalsText}>{overtimeRequest.total_hours || 0} saat</Text></View>
            <View style={[staffStyles.tableDataCellLast, { width: 120 }]}><Text style={staffStyles.tableTotalsText}>{(overtimeRequest.total_pay || 0).toLocaleString('tr-TR')} TL</Text></View>
          </View>
        </View>
      )}

      {overtimeRequest.reason_detail && (
        <View style={staffStyles.noteBlock}>
          <Text style={staffStyles.noteLabel}>ÇALIŞMAYI TALEP EDEN KİŞİ VEYA ÇALIŞMAYA NEDEN OLAN DURUM:</Text>
          <Text style={staffStyles.noteText}>{overtimeRequest.reason_detail}</Text>
        </View>
      )}
      {overtimeRequest.hr_note && (
        <View style={staffStyles.noteBlock}>
          <Text style={staffStyles.noteLabel}>İNSAN KAYNAKLARI NOTU:</Text>
          <Text style={staffStyles.noteText}>{overtimeRequest.hr_note}</Text>
        </View>
      )}

      <View style={staffStyles.onayHeader}><Text style={staffStyles.onayHeaderText}>ONAY</Text></View>
      <View style={staffStyles.onayContent}>
        {approvalColumns.map((col, idx) => (
          <View key={idx} style={idx === approvalColumns.length - 1 ? staffStyles.onayColumnLast : staffStyles.onayColumn}>
            <View style={staffStyles.onayTitleRow}><Text style={staffStyles.onayTitleText}>{col.title}</Text></View>
            <View style={staffStyles.onaySignatureRow}>
              <Text style={staffStyles.onayNameText}>{col.name}</Text>
              {renderSig(col.employeeId, col.status)}
            </View>
            {col.note ? (<View style={staffStyles.onayNoteRow}><Text style={staffStyles.onayNoteText}>{col.note}</Text></View>) : null}
          </View>
        ))}
      </View>
      {/* <View style={staffStyles.footer}><Text>Tüm Formlar SharePoint/İK/Formlar dosyasına kaydedilir.</Text></View> */}
    </Page>
  );
};

interface EmergencyProps {
  request: any;
  requester: any;
  overtimeRequest: any;
  approvalColumns: { title: string; name: string; employeeId: string; note: string; status?: string }[];
  signatures: Record<string, SignatureInfo>;
}

const EmergencyPDF: React.FC<EmergencyProps> = ({
  request, requester, overtimeRequest, approvalColumns, signatures,
}) => {
  const renderSig = (employeeId: string, status?: string) => {
    if (status === 'REJECTED') return <Text style={staffStyles.onaySignatureRejected}>Reddedildi</Text>;
    const sig = signatures[employeeId];
    if (sig) return <Text style={[staffStyles.onaySignatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return <Text style={staffStyles.onaySignatureStatus}>İmza</Text>;
  };

  const monthName = MONTH_NAMES[String(overtimeRequest.month)] || String(overtimeRequest.month);
  const requestDate = format(new Date(request.created_at), 'dd/MM/yyyy');
  const fmtDate = (val: string | null) => val ? format(new Date(val), 'dd/MM/yyyy HH:mm') : '-';

  return (
    <Page size="A4" style={staffStyles.page}>
      <View style={staffStyles.logoContainer}><Image src={getLogoPath()} style={staffStyles.logo} /></View>
      <View style={staffStyles.divider} />
      <Text style={staffStyles.title}>FAZLA MESAİ ONAY FORMU</Text>
      <Text style={staffStyles.subjectText}>Konu: Fazla Mesai Çalışmaları</Text>
      <Text style={[staffStyles.subjectText, { marginBottom: 12 }]}>{overtimeRequest.work_location || 'Merkez, Şube ve İşletmeler'}</Text>
      <Text style={staffStyles.bodyText}>
        {reasonCategoryLabels[overtimeRequest.reason_category] || overtimeRequest.reason_category}{' nedeniyle gerçekleştirilen '}{overtimeRequest.year}{' yılı '}{monthName}{' ayına ilişkin FAZLA MESAİ çalışmasının ödenmesini onayınıza sunarım.\n'}{requestDate}
      </Text>
      <View style={staffStyles.rightBlock}>
        <Text style={staffStyles.rightLabel}>İnsan Kaynakları</Text>
        <Text style={staffStyles.rightName}>{requester.first_name} {requester.last_name}</Text>
        {renderSig(requester.id)}
      </View>

      {/* Çalışma Detayları */}
      <View style={staffStyles.fieldTable}>
        <View style={staffStyles.fieldRow}>
          <View style={staffStyles.fieldLabel}><Text style={staffStyles.fieldLabelText}>Çalışma Yeri</Text></View>
          <View style={staffStyles.fieldValue}><Text style={staffStyles.fieldValueText}>{overtimeRequest.work_location || '-'}</Text></View>
        </View>
        <View style={staffStyles.fieldRow}>
          <View style={staffStyles.fieldLabel}><Text style={staffStyles.fieldLabelText}>Çalışma Tarihi</Text></View>
          <View style={staffStyles.fieldValue}><Text style={staffStyles.fieldValueText}>{fmtDate(overtimeRequest.work_start_date)} – {fmtDate(overtimeRequest.work_end_date)}</Text></View>
        </View>
        <View style={staffStyles.fieldRow}>
          <View style={staffStyles.fieldLabel}><Text style={staffStyles.fieldLabelText}>Önceki Vardiya</Text></View>
          <View style={staffStyles.fieldValue}><Text style={staffStyles.fieldValueText}>{fmtDate(overtimeRequest.previous_shift_start)} – {fmtDate(overtimeRequest.previous_shift_end)}</Text></View>
        </View>
        <View style={staffStyles.fieldRow}>
          <View style={staffStyles.fieldLabel}><Text style={staffStyles.fieldLabelText}>Sonraki Vardiya</Text></View>
          <View style={staffStyles.fieldValue}><Text style={staffStyles.fieldValueText}>{fmtDate(overtimeRequest.next_shift_start)} – {fmtDate(overtimeRequest.next_shift_end)}</Text></View>
        </View>
        <View style={staffStyles.fieldRowLast}>
          <View style={staffStyles.fieldLabel}><Text style={staffStyles.fieldLabelText}>Çalışma Nedeni</Text></View>
          <View style={staffStyles.fieldValue}><Text style={staffStyles.fieldValueText}>{overtimeRequest.work_reason || '-'}</Text></View>
        </View>
      </View>

      {overtimeRequest.reason_detail && (
        <View style={staffStyles.noteBlock}>
          <Text style={staffStyles.noteLabel}>ÇALIŞMAYI TALEP EDEN KİŞİ VEYA ÇALIŞMAYA NEDEN OLAN DURUM:</Text>
          <Text style={staffStyles.noteText}>{overtimeRequest.reason_detail}</Text>
        </View>
      )}
      {overtimeRequest.hr_note && (
        <View style={staffStyles.noteBlock}>
          <Text style={staffStyles.noteLabel}>İNSAN KAYNAKLARI NOTU:</Text>
          <Text style={staffStyles.noteText}>{overtimeRequest.hr_note}</Text>
        </View>
      )}

      <View style={staffStyles.onayHeader}><Text style={staffStyles.onayHeaderText}>ONAY</Text></View>
      <View style={staffStyles.onayContent}>
        {approvalColumns.map((col, idx) => (
          <View key={idx} style={idx === approvalColumns.length - 1 ? staffStyles.onayColumnLast : staffStyles.onayColumn}>
            <View style={staffStyles.onayTitleRow}><Text style={staffStyles.onayTitleText}>{col.title}</Text></View>
            <View style={staffStyles.onaySignatureRow}>
              <Text style={staffStyles.onayNameText}>{col.name}</Text>
              {renderSig(col.employeeId, col.status)}
            </View>
            {col.note ? (<View style={staffStyles.onayNoteRow}><Text style={staffStyles.onayNoteText}>{col.note}</Text></View>) : null}
          </View>
        ))}
      </View>
    </Page>
  );
};

export const OvertimePDFTemplate: React.FC<OvertimePDFTemplateProps> = ({
  request, requester, overtimeRequest, entries = [], approvals, signatures = {},
}) => {
  const getApprovalColumns = () => {
    const columns: { title: string; name: string; employeeId: string; note: string; status?: string }[] = [{ title: 'İnsan Kaynakları', name: `${requester.first_name} ${requester.last_name}`, employeeId: requester.id, note: '' }];
    const sortedApprovals = approvals.filter((a) => a.workflow_step.step_order > 1).sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);
    sortedApprovals.forEach((approval) => {
      const positionTitle = approval.workflow_step.static_position ? approval.workflow_step.static_position.title : approval.workflow_step.name;
      columns.push({ title: positionTitle, name: `${approval.approver.first_name} ${approval.approver.last_name}`, employeeId: approval.approver.id, note: approval.comment || '', status: approval.status });
    });
    return columns;
  };

  const approvalColumns = getApprovalColumns();
  const isEmergency = overtimeRequest.overtime_type === 'EMERGENCY';
  const actualEntries = overtimeRequest.entries || entries || [];

  if (!isEmergency) {
    return (
      <Document>
        <StaffShortagePDF
          request={request}
          requester={requester}
          overtimeRequest={overtimeRequest}
          entries={actualEntries}
          approvalColumns={approvalColumns.slice(1)}
          signatures={signatures}
        />
      </Document>
    );
  }

  return (
    <Document>
      <EmergencyPDF
        request={request}
        requester={requester}
        overtimeRequest={overtimeRequest}
        approvalColumns={approvalColumns.slice(1)}
        signatures={signatures}
      />
    </Document>
  );
};

