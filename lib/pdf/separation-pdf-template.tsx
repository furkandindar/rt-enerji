import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image, Svg, Path, Line } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import type { PdfApproval, PdfRequest, PdfRequester, SignatureInfo } from './types';
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

const colors = { red: '#CC0000', redLight: '#FFF0F0', black: '#000000', white: '#FFFFFF' };

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: 'Roboto', backgroundColor: colors.white },
  headerContainer: { flexDirection: 'row', borderWidth: 1, borderColor: colors.black },
  logoCell: { width: 60, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  logoImage: { width: 40, height: 40 },
  titleCell: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 6 },
  titleText: { fontSize: 13, fontWeight: 700 },
  infoContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  infoLeftColumn: { width: '50%', borderRightWidth: 1, borderColor: colors.black },
  infoRightColumn: { width: '50%' },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 18 },
  infoRowLast: { flexDirection: 'row', minHeight: 18 },
  infoLabelCell: { width: '45%', backgroundColor: colors.redLight, padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  infoValueCell: { width: '55%', padding: 4, justifyContent: 'center' },
  labelText: { fontSize: 7, fontWeight: 500 },
  valueText: { fontSize: 7 },
  financialContainer: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  financialHeader: { flexDirection: 'row', backgroundColor: colors.red, borderBottomWidth: 1, borderColor: colors.black },
  financialHeaderCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  financialHeaderCellLast: { padding: 4, justifyContent: 'center' },
  financialHeaderText: { fontSize: 7, fontWeight: 700, textAlign: 'center', color: colors.white },
  financialRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 18 },
  financialRowLast: { flexDirection: 'row', minHeight: 18 },
  financialCell: { padding: 3, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  financialCellLast: { padding: 3, justifyContent: 'center' },
  financialCellText: { fontSize: 7 },
  financialCellCenter: { fontSize: 7, textAlign: 'center' },
  tableContainer: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.red, borderBottomWidth: 1, borderColor: colors.black },
  tableHeaderCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  tableHeaderCellLast: { padding: 4, justifyContent: 'center' },
  tableHeaderText: { fontSize: 7, fontWeight: 700, textAlign: 'center', color: colors.white },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 20 },
  tableRowLast: { flexDirection: 'row', minHeight: 20 },
  tableCell: { padding: 3, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  tableCellLast: { padding: 3, justifyContent: 'center' },
  tableCellText: { fontSize: 7 },
  tableCellCenter: { fontSize: 7, textAlign: 'center' },
  approvalContainer: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, minHeight: 50 },
  approvalColumn: { flex: 1, borderRightWidth: 1, borderColor: colors.black, padding: 6 },
  approvalColumnLast: { flex: 1, padding: 6 },
  approvalTitle: { fontSize: 7, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
  approvalSubtitle: { fontSize: 7, fontWeight: 700, textAlign: 'center', color: colors.red },
  approvalName: { fontSize: 7, textAlign: 'center', marginTop: 4 },
  signatureText: { fontSize: 14, color: '#1a365d', textAlign: 'center' },
  signatureTextSmall: { fontSize: 8, color: '#1a365d', textAlign: 'center' as const },
});



const CheckIcon = () => (
  <Svg width="10" height="10" viewBox="0 0 24 24">
    <Path d="M5 13l4 4L19 7" stroke="#008000" strokeWidth="3" fill="none" />
  </Svg>
);

const CrossIcon = () => (
  <Svg width="10" height="10" viewBox="0 0 24 24">
    <Line x1="6" y1="6" x2="18" y2="18" stroke="#CC0000" strokeWidth="3" />
    <Line x1="18" y1="6" x2="6" y2="18" stroke="#CC0000" strokeWidth="3" />
  </Svg>
);

const DashIcon = () => (
  <Svg width="10" height="10" viewBox="0 0 24 24">
    <Line x1="5" y1="12" x2="19" y2="12" stroke="#666666" strokeWidth="3" />
  </Svg>
);

const statusIconMap: Record<string, React.FC> = { DONE: CheckIcon, NOT_DONE: CrossIcon, NA: DashIcon };
const getStatusIcon = (status: string | number | null | undefined) => { if (!status || typeof status !== 'string') return null; const Icon = statusIconMap[status]; return Icon ? <Icon /> : null; };

interface ChecklistItem { label: string; statusKey: string; notesKey: string; sectionKey: string; }

const checklistItems: ChecklistItem[] = [
  { label: 'E-posta Hesaplarının Kapatılması / Yönlendirilmesi', statusKey: 'email_closure_status', notesKey: 'email_closure_notes', sectionKey: 'section_2' },
  { label: 'Bilgi İşlem Hesaplarının ve Erişimlerin İptali', statusKey: 'it_access_revocation_status', notesKey: 'it_access_revocation_notes', sectionKey: 'section_2' },
  { label: 'İşten Çıkış Evraklarının Hazırlanması', statusKey: 'exit_documents_status', notesKey: 'exit_documents_notes', sectionKey: 'section_3' },
  { label: 'Personel Listesine Çıkış Kaydının Yapılması', statusKey: 'personnel_list_removal_status', notesKey: 'personnel_list_removal_notes', sectionKey: 'section_3' },
  { label: 'Bordro ile İlgili İşlemlerin Yapılması', statusKey: 'payroll_processing_status', notesKey: 'payroll_processing_notes', sectionKey: 'section_3' },
  { label: 'Personel Avans Kontrolü', statusKey: 'advance_check_status', notesKey: 'advance_check_notes', sectionKey: 'section_3' },
  { label: 'Zimmetli Eşyaların Teslim Alınması / Tutanak', statusKey: 'equipment_return_status', notesKey: 'equipment_return_notes', sectionKey: 'section_3' },
  { label: 'Zimmetli Kıyafetlerin Teslimi / Tutanak', statusKey: 'uniform_return_status', notesKey: 'uniform_return_notes', sectionKey: 'section_3' },
  { label: 'Anlaşmalı Hastane Kayıtlarından Silinmesi İçin Bildirim Yapılması', statusKey: 'hospital_removal_status', notesKey: 'hospital_removal_notes', sectionKey: 'section_3' },
  { label: 'Ana Bina ve Ofis Giriş Kartı Teslimi', statusKey: 'access_card_return_status', notesKey: 'access_card_return_notes', sectionKey: 'section_3' },
  { label: 'Çalıştığı Lokasyon Güvenliğe Bilgi Verilmesi', statusKey: 'security_notification_status', notesKey: 'security_notification_notes', sectionKey: 'section_3' },
  { label: 'Organizasyon Şemasından Çıkartılması', statusKey: 'org_chart_removal_status', notesKey: 'org_chart_removal_notes', sectionKey: 'section_3' },
  { label: 'SGK ve Emniyet Bildirimlerinin Yapılması', statusKey: 'sgk_notification_status', notesKey: 'sgk_notification_notes', sectionKey: 'section_3' },
  { label: 'Vekaletname, Yetki Belgesi ve UYAP Kaydı Kontrolü / Azli', statusKey: 'poa_uyap_revocation_status', notesKey: 'poa_uyap_revocation_notes', sectionKey: 'section_4' },
  { label: 'Mersis Kayıtları Kontrolü / İptali', statusKey: 'mersis_revocation_status', notesKey: 'mersis_revocation_notes', sectionKey: 'section_4' },
  { label: 'Zimmetli Eşyaların Teslim Alınması / Tutanak (Hukuk)', statusKey: 'legal_equipment_return_status', notesKey: 'legal_equipment_return_notes', sectionKey: 'section_4' },
  { label: 'Personel Harcama Formunun Personel Tarafından Eksiksiz Olarak Teslimi', statusKey: 'expense_form_submission_status', notesKey: 'expense_form_submission_notes', sectionKey: 'section_5' },
  { label: 'Personel Harcama Formu Muhasebe Kontrolü', statusKey: 'expense_form_review_status', notesKey: 'expense_form_review_notes', sectionKey: 'section_5' },
  { label: 'Personel Avans Kontrolü (Muhasebe)', statusKey: 'accounting_advance_check_status', notesKey: 'accounting_advance_check_notes', sectionKey: 'section_5' },
  { label: 'Banka ve Kurum Kayıtları Kontrolü / Erişimin Kapatılması (TEİAŞ, EPİAŞ vb.)', statusKey: 'bank_institution_access_revocation_status', notesKey: 'bank_institution_access_revocation_notes', sectionKey: 'section_5' },
  { label: 'Bilg/QNAP Arşiv ve Sıfırlama O365 Arşiv IP Telefon Kaydı Kaldırılması', statusKey: 'qnap_o365_ip_removal_status', notesKey: 'qnap_o365_ip_removal_notes', sectionKey: 'section_6' },
  { label: 'PC Kontrolü (İhtiyaç Halinde Profesyonel Kontrol)', statusKey: 'pc_check_status', notesKey: 'pc_check_notes', sectionKey: 'section_6' },
  { label: 'Tüm Belgelerin Taranması', statusKey: 'documents_scan_status', notesKey: 'documents_scan_notes', sectionKey: 'section_7' },
  { label: '2/6/12. Aylar Değerlendirme Formlarının Takvimden Silinmesi', statusKey: 'evaluation_calendar_removal_status', notesKey: 'evaluation_calendar_removal_notes', sectionKey: 'section_8' },
];

interface SeparationRequest {
  employee_name?: string | null;
  employee_title?: string | null;
  department?: string | null;
  location?: string | null;
  job_description?: string | null;
  reporting_manager?: string | null;
  separation_date?: string | null;
  separation_reason?: string | null;
  employment_period?: string | null;
  annual_leave_days?: number | null;
  annual_leave_amount?: number | null;
  severance_days?: number | null;
  severance_amount?: number | null;
  notice_weeks?: number | null;
  notice_amount?: number | null;
  [key: string]: string | number | null | undefined;
}

interface SeparationPDFTemplateProps {
  request: PdfRequest;
  requester: PdfRequester;
  separationRequest: SeparationRequest;
  approvals: PdfApproval[];
  signatures?: Record<string, SignatureInfo>;
}

export const SeparationPDFTemplate: React.FC<SeparationPDFTemplateProps> = ({
  requester, separationRequest: sr, approvals, signatures = {},
}) => {
  const renderSignature = (employeeId: string, small = false, status?: string) => {
    if (status === 'REJECTED') {
      return <Text style={{ fontSize: small ? 8 : 9, fontWeight: 700, color: '#DC2626' }}>Reddedildi</Text>;
    }
    const sig = signatures[employeeId];
    if (sig) return <Text style={[small ? styles.signatureTextSmall : styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return null;
  };

  const sectionToEmployeeId: Record<string, string> = {};
  const sectionToStatus: Record<string, string> = {};
  sectionToEmployeeId['section_1'] = requester.id;
  sectionToEmployeeId['section_3'] = requester.id;
  approvals.forEach((a) => {
    if (a.workflow_step?.form_section_key) {
      sectionToEmployeeId[a.workflow_step.form_section_key] = a.approver.id;
      sectionToStatus[a.workflow_step.form_section_key] = a.status;
    }
  });

  const sortedApprovals = approvals
    .filter((a) => a.workflow_step?.step_order > 1)
    .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);

  const lastApproval = sortedApprovals.length > 0 ? sortedApprovals[sortedApprovals.length - 1] : null;
  const secondToLastApproval = sortedApprovals.length > 1 ? sortedApprovals[sortedApprovals.length - 2] : null;

  const formatCurrency = (val: number | null | undefined) => val != null ? `${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : '-';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>İŞTEN ÇIKIŞ TAKİP FORMU</Text></View>
        </View>

        {/* Temel Bilgiler */}
        <View style={styles.infoContent}>
          <View style={styles.infoLeftColumn}>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Ayrılacak Personel</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.employee_name || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Unvanı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.employee_title || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Departmanı/Lokasyonu</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{[sr.department, sr.location].filter(Boolean).join(' / ') || '-'}</Text></View></View>
            <View style={styles.infoRowLast}><View style={styles.infoLabelCell}><Text style={styles.labelText}>İş Tanımı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.job_description || '-'}</Text></View></View>
          </View>
          <View style={styles.infoRightColumn}>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Bağlı Olduğu Yönetici</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.reporting_manager || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>İşten Ayrılış Tarihi</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.separation_date ? format(new Date(sr.separation_date), 'dd/MM/yyyy') : '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Ayrılış Nedeni</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.separation_reason || '-'}</Text></View></View>
            <View style={styles.infoRowLast}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Çalışma Süresi</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{sr.employment_period || '-'}</Text></View></View>
          </View>
        </View>


        {/* Mali Tablo */}
        <View style={styles.financialContainer}>
          <View style={styles.financialHeader}>
            <View style={{ ...styles.financialHeaderCell, flex: 2 }}><Text style={styles.financialHeaderText}>MALİ TABLO</Text></View>
            <View style={{ ...styles.financialHeaderCell, width: 60 }}><Text style={styles.financialHeaderText}>GÜN / HAFTA</Text></View>
            <View style={{ ...styles.financialHeaderCellLast, width: 100 }}><Text style={styles.financialHeaderText}>TUTAR (TL)</Text></View>
          </View>
          <View style={styles.financialRow}>
            <View style={{ ...styles.financialCell, flex: 2 }}><Text style={styles.financialCellText}>Yıllık İzin Alacağı</Text></View>
            <View style={{ ...styles.financialCell, width: 60 }}><Text style={styles.financialCellCenter}>{sr.annual_leave_days ?? 0} gün</Text></View>
            <View style={{ ...styles.financialCellLast, width: 100 }}><Text style={styles.financialCellCenter}>{formatCurrency(sr.annual_leave_amount)}</Text></View>
          </View>
          <View style={styles.financialRow}>
            <View style={{ ...styles.financialCell, flex: 2 }}><Text style={styles.financialCellText}>Kıdem Tazminatı</Text></View>
            <View style={{ ...styles.financialCell, width: 60 }}><Text style={styles.financialCellCenter}>{sr.severance_days ?? 0} gün</Text></View>
            <View style={{ ...styles.financialCellLast, width: 100 }}><Text style={styles.financialCellCenter}>{formatCurrency(sr.severance_amount)}</Text></View>
          </View>
          <View style={styles.financialRowLast}>
            <View style={{ ...styles.financialCell, flex: 2 }}><Text style={styles.financialCellText}>İhbar Tazminatı</Text></View>
            <View style={{ ...styles.financialCell, width: 60 }}><Text style={styles.financialCellCenter}>{sr.notice_weeks ?? 0} hafta</Text></View>
            <View style={{ ...styles.financialCellLast, width: 100 }}><Text style={styles.financialCellCenter}>{formatCurrency(sr.notice_amount)}</Text></View>
          </View>
        </View>

        {/* Checklist Tablosu */}
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <View style={{ ...styles.tableHeaderCell, width: 22 }}><Text style={styles.tableHeaderText}>No:</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 230 }}><Text style={styles.tableHeaderText}>İş</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 45 }}><Text style={styles.tableHeaderText}>DURUM</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 80 }}><Text style={styles.tableHeaderText}>İMZA</Text></View>
            <View style={{ ...styles.tableHeaderCellLast, flex: 1 }}><Text style={styles.tableHeaderText}>AÇIKLAMA</Text></View>
          </View>
          {checklistItems.map((item, index) => {
            const isLast = index === checklistItems.length - 1;
            const rowStyle = isLast ? styles.tableRowLast : styles.tableRow;
            const sectionEmployeeId = sectionToEmployeeId[item.sectionKey];
            return (
              <View key={index} style={rowStyle}>
                <View style={{ ...styles.tableCell, width: 22 }}><Text style={styles.tableCellCenter}>{index + 1}</Text></View>
                <View style={{ ...styles.tableCell, width: 230 }}><Text style={styles.tableCellText}>{item.label}</Text></View>
                <View style={{ ...styles.tableCell, width: 45, alignItems: 'center' }}>{getStatusIcon(sr[item.statusKey])}</View>
                <View style={{ ...styles.tableCell, width: 80, alignItems: 'center' }}>{sectionEmployeeId ? renderSignature(sectionEmployeeId, true, sectionToStatus[item.sectionKey]) : null}</View>
                <View style={{ ...styles.tableCellLast, flex: 1 }}><Text style={styles.tableCellText}>{sr[item.notesKey] || ''}</Text></View>
              </View>
            );
          })}
        </View>

        {/* Onay Footer */}
        <View style={styles.approvalContainer}>
          <View style={styles.approvalColumn}>
            <Text style={styles.approvalTitle}>EK: ZİMMET TUTANAĞI</Text>
          </View>
          <View style={styles.approvalColumn}>
            <Text style={styles.approvalTitle}>FORM İÇERİĞİ KONTROLÜ</Text>
            {secondToLastApproval ? (
              <>
                <Text style={styles.approvalSubtitle}>{(secondToLastApproval.workflow_step.name || secondToLastApproval.workflow_step.static_position?.title || '').toUpperCase()}</Text>
                <Text style={styles.approvalName}>{secondToLastApproval.approver.first_name} {secondToLastApproval.approver.last_name}</Text>
                {secondToLastApproval.decided_at ? <Text style={styles.approvalName}>{format(new Date(secondToLastApproval.decided_at), 'dd/MM/yyyy')}</Text> : null}
                {renderSignature(secondToLastApproval.approver.id, false, secondToLastApproval.status)}
              </>
            ) : null}
          </View>
          <View style={styles.approvalColumnLast}>
            <Text style={styles.approvalTitle}>ONAY</Text>
            {lastApproval ? (
              <>
                <Text style={styles.approvalSubtitle}>{(lastApproval.workflow_step.name || lastApproval.workflow_step.static_position?.title || '').toUpperCase()}</Text>
                <Text style={styles.approvalName}>{lastApproval.approver.first_name} {lastApproval.approver.last_name}</Text>
                {renderSignature(lastApproval.approver.id, false, lastApproval.status)}
              </>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
};
