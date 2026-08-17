import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image, Svg, Path, Line } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { formatTrDate } from '@/lib/timezone';
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

const colors = { green: '#008000', greenLight: '#E8F5E9', black: '#000000', white: '#FFFFFF', red: '#CC0000' };

const styles = StyleSheet.create({
  page: { padding: 20, fontSize: 8, fontFamily: 'Roboto', backgroundColor: colors.white },
  // Header
  headerContainer: { flexDirection: 'row', borderWidth: 1, borderColor: colors.black },
  logoCell: { width: 60, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  logoImage: { width: 40, height: 40 },
  titleCell: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 6 },
  titleText: { fontSize: 13, fontWeight: 700 },
  // Info table
  infoContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  infoLeftColumn: { width: '50%', borderRightWidth: 1, borderColor: colors.black },
  infoRightColumn: { width: '50%' },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 18 },
  infoRowLast: { flexDirection: 'row', minHeight: 18 },
  infoLabelCell: { width: '45%', backgroundColor: colors.greenLight, padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  infoValueCell: { width: '55%', padding: 4, justifyContent: 'center' },
  labelText: { fontSize: 7, fontWeight: 500 },
  valueText: { fontSize: 7 },
  // Checklist table
  tableContainer: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.green, borderBottomWidth: 1, borderColor: colors.black },
  tableHeaderCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  tableHeaderCellLast: { padding: 4, justifyContent: 'center' },
  tableHeaderText: { fontSize: 7, fontWeight: 700, textAlign: 'center', color: colors.white },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 20 },
  tableRowLast: { flexDirection: 'row', minHeight: 20 },
  tableCell: { padding: 3, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  tableCellLast: { padding: 3, justifyContent: 'center' },
  tableCellText: { fontSize: 7 },
  tableCellCenter: { fontSize: 7, textAlign: 'center' },
  // Approval footer
  approvalContainer: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, minHeight: 50 },
  approvalColumn: { flex: 1, borderRightWidth: 1, borderColor: colors.black, padding: 6 },
  approvalColumnLast: { flex: 1, padding: 6 },
  approvalTitle: { fontSize: 7, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
  approvalSubtitle: { fontSize: 7, fontWeight: 700, textAlign: 'center', color: colors.red },
  approvalName: { fontSize: 7, textAlign: 'center', marginTop: 4 },
  signatureText: { fontSize: 14, color: '#1a365d', textAlign: 'center' },
  signatureTextSmall: { fontSize: 8, color: '#1a365d', textAlign: 'center' as const },
  signatureStatus: { fontSize: 7, color: '#666', textAlign: 'center' },
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

const statusIconMap: Record<string, React.FC> = {
  DONE: CheckIcon,
  NOT_DONE: CrossIcon,
  NA: DashIcon,
};

const getStatusIcon = (status: string | null) => {
  if (!status) return null;
  const Icon = statusIconMap[status];
  return Icon ? <Icon /> : null;
};

interface ChecklistItem {
  label: string;
  statusKey: string;
  notesKey: string;
  sectionKey: string; // maps to workflow_step.form_section_key
}

// Flat checklist - all items in a single sequential list (matching the screenshot layout)
// sectionKey maps each item to the workflow step that fills it
// section_1: IK (requester), section_2: Genel Müdür/CEO, section_3: IK (requester)
// section_4: Muhasebe Müdürü, section_5: İdari İşler Müdürü, section_6: Finans Uzmanı
const checklistItems: ChecklistItem[] = [
  { label: 'Sigara Kullanımı', statusKey: 'smoking_info_status', notesKey: 'smoking_info_notes', sectionKey: 'section_6' },
  { label: 'İşten Çıkış Sebebi Kontrolü (Daha Önce Çalışanlar İçin)', statusKey: 'exit_reason_check_status', notesKey: 'exit_reason_check_notes', sectionKey: 'section_3' },
  { label: "CV'de Yazan Şirketlerin SGK Hizmet Dökümü İle Kontrolü", statusKey: 'sgk_verification_status', notesKey: 'sgk_verification_notes', sectionKey: 'section_3' },
  { label: 'PDKS Kayıtları / Kart Tanımı', statusKey: 'pdks_card_status', notesKey: 'pdks_card_notes', sectionKey: 'section_3' },
  { label: 'Mail Adresinin Açılması', statusKey: 'mail_setup_status', notesKey: 'mail_setup_notes', sectionKey: 'section_2' },
  { label: 'Ekleneceği Mail/Sharepoint/Bulut Grupları', statusKey: 'mail_groups_status', notesKey: 'mail_groups_notes', sectionKey: 'section_2' },
  { label: 'Bilgisayar Temini', statusKey: 'computer_setup_status', notesKey: 'computer_setup_notes', sectionKey: 'section_5' },
  { label: 'QNAP Kaydı, O365 Arşiv ve IP Telefon Kaydı', statusKey: 'qnap_o365_ip_status', notesKey: 'qnap_o365_ip_notes', sectionKey: 'section_5' },
  { label: 'İş Sözleşmesi, ekleri ve zimmet tutanağın (ekte olmak) imzalatılması', statusKey: 'contract_signature_status', notesKey: 'contract_signature_notes', sectionKey: 'section_4' },
  { label: 'Yönergelerin Basılı ve Elektronik Olarak Teslimi (İdari, mali işler ve tüm diğer tüm yönergeler)', statusKey: 's4_guidelines_delivery_status', notesKey: 's4_guidelines_delivery_notes', sectionKey: 'section_4' },
  { label: 'Kırtasiye Taleplerinin Yapılması', statusKey: 'stationery_request_status', notesKey: 'stationery_request_notes', sectionKey: 'section_3' },
  { label: 'Masa / Dolap Tanımı', statusKey: 'desk_cabinet_status', notesKey: 'desk_cabinet_notes', sectionKey: 'section_3' },
  { label: 'Sabit Telefon Temini ve Tanımı', statusKey: 'phone_setup_status', notesKey: 'phone_setup_notes', sectionKey: 'section_3' },
  { label: 'İşe Alım Duyurusu', statusKey: 'hiring_announcement_status', notesKey: 'hiring_announcement_notes', sectionKey: 'section_3' },
  { label: 'Anlaşmalı Hastaneye Yeni Personel Bildirimi', statusKey: 'hospital_notification_status', notesKey: 'hospital_notification_notes', sectionKey: 'section_3' },
  { label: 'Personele, Hastaneye İlişkin Haklarının Bildirimi', statusKey: 'hospital_rights_notification_status', notesKey: 'hospital_rights_notification_notes', sectionKey: 'section_3' },
  { label: 'Adres Bilgileri ve Mobil Numarası ve Şahsi e-posta bilgisi', statusKey: 'contact_info_status', notesKey: 'contact_info_notes', sectionKey: 'section_3' },
  { label: 'Organizasyon Şemasına Eklenmesi ve Yayımı', statusKey: 'org_chart_status', notesKey: 'org_chart_notes', sectionKey: 'section_3' },
  { label: 'SGK, İşkur ve Emniyet Bildirimlerinin Yapılması', statusKey: 'sgk_iskur_notification_status', notesKey: 'sgk_iskur_notification_notes', sectionKey: 'section_3' },
  { label: 'İş Kazası Talimatı ve İş Sağlığı Güvenliği Talimatının İmzalatılması', statusKey: 'safety_instructions_status', notesKey: 'safety_instructions_notes', sectionKey: 'section_3' },
  { label: '2/6/12. Aylarda Değerlendirme Form Tarihlerinin Takvime Kaydedilmesi', statusKey: 'evaluation_calendar_status', notesKey: 'evaluation_calendar_notes', sectionKey: 'section_6' },
  { label: 'İşe Giriş İşlemleri ve Sicil Numarasının Yapılması', statusKey: 'entry_registration_status', notesKey: 'entry_registration_notes', sectionKey: 'section_3' },
  { label: "İşe Giriş Evraklarının Bulut'a Yüklenmesi (İK/Belgeler)", statusKey: 'documents_upload_status', notesKey: 'documents_upload_notes', sectionKey: 'section_3' },
];

interface OnboardingRequest {
  employee_name?: string | null;
  employee_title?: string | null;
  department?: string | null;
  location?: string | null;
  reporting_manager?: string | null;
  start_date?: string | null;
  employment_period?: string | null;
  job_description?: string | null;
  [key: string]: string | null | undefined;
}

interface OnboardingPDFTemplateProps {
  request: PdfRequest;
  requester: PdfRequester;
  onboardingRequest: OnboardingRequest;
  approvals: PdfApproval[];
  signatures?: Record<string, SignatureInfo>;
}

export const OnboardingPDFTemplate: React.FC<OnboardingPDFTemplateProps> = ({
  requester, onboardingRequest, approvals, signatures = {},
}) => {
  const renderSignature = (employeeId: string, small = false, status?: string) => {
    if (status === 'REJECTED') {
      return <Text style={{ fontSize: small ? 8 : 9, fontWeight: 700, color: '#DC2626' }}>Reddedildi</Text>;
    }
    const sig = signatures[employeeId];
    if (sig) return <Text style={[small ? styles.signatureTextSmall : styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return null;
  };

  // Build a map: sectionKey -> employeeId of the person who filled that section
  const sectionToEmployeeId: Record<string, string> = {};
  const sectionToStatus: Record<string, string> = {};
  // section_1 and section_3 are filled by the requester (IK)
  sectionToEmployeeId['section_1'] = requester.id;
  sectionToEmployeeId['section_3'] = requester.id;
  // Other sections are filled by the corresponding approver
  approvals.forEach((a) => {
    if (a.workflow_step.form_section_key) {
      sectionToEmployeeId[a.workflow_step.form_section_key] = a.approver.id;
      sectionToStatus[a.workflow_step.form_section_key] = a.status;
    }
  });

  // Sort approvals by step_order for footer
  const sortedApprovals = approvals
    .filter((a) => a.workflow_step.step_order > 1)
    .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);

  // Second-to-last and last approver for footer
  const lastApproval = sortedApprovals.length > 0 ? sortedApprovals[sortedApprovals.length - 1] : null;
  const secondToLastApproval = sortedApprovals.length > 1 ? sortedApprovals[sortedApprovals.length - 2] : null;



  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>İŞE GİRİŞ TAKİP FORMU</Text></View>
        </View>

        {/* Temel Bilgiler */}
        <View style={styles.infoContent}>
          <View style={styles.infoLeftColumn}>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>İşe Başlayacak Kişi</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.employee_name || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Unvanı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.employee_title || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Departmanı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.department || '-'}</Text></View></View>
            <View style={styles.infoRowLast}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Lokasyonu</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.location || '-'}</Text></View></View>
          </View>
          <View style={styles.infoRightColumn}>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Bağlı Olduğu Yönetici</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.reporting_manager || '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>İşe Giriş Tarihi</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.start_date ? format(new Date(onboardingRequest.start_date), 'dd/MM/yyyy') : '-'}</Text></View></View>
            <View style={styles.infoRow}><View style={styles.infoLabelCell}><Text style={styles.labelText}>Zaman Aralığı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.employment_period || '-'}</Text></View></View>
            <View style={styles.infoRowLast}><View style={styles.infoLabelCell}><Text style={styles.labelText}>İş Tanımı</Text></View><View style={styles.infoValueCell}><Text style={styles.valueText}>{onboardingRequest.job_description || '-'}</Text></View></View>
          </View>
        </View>

        {/* Checklist Table */}
        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={{ ...styles.tableHeaderCell, width: 22 }}><Text style={styles.tableHeaderText}>No:</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 230 }}><Text style={styles.tableHeaderText}>İş</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 45 }}><Text style={styles.tableHeaderText}>DURUM</Text></View>
            <View style={{ ...styles.tableHeaderCell, width: 80 }}><Text style={styles.tableHeaderText}>İMZA</Text></View>
            <View style={{ ...styles.tableHeaderCellLast, flex: 1 }}><Text style={styles.tableHeaderText}>AÇIKLAMA</Text></View>
          </View>
          {/* Table Rows */}
          {checklistItems.map((item, index) => {
            const isLast = index === checklistItems.length - 1;
            const rowStyle = isLast ? styles.tableRowLast : styles.tableRow;
            const sectionEmployeeId = sectionToEmployeeId[item.sectionKey];
            return (
              <View key={index} style={rowStyle}>
                <View style={{ ...styles.tableCell, width: 22 }}><Text style={styles.tableCellCenter}>{index + 1}</Text></View>
                <View style={{ ...styles.tableCell, width: 230 }}><Text style={styles.tableCellText}>{item.label}</Text></View>
                <View style={{ ...styles.tableCell, width: 45, alignItems: 'center' }}>{getStatusIcon(onboardingRequest[item.statusKey] ?? null)}</View>
                <View style={{ ...styles.tableCell, width: 80, alignItems: 'center' }}>{sectionEmployeeId ? renderSignature(sectionEmployeeId, true, sectionToStatus[item.sectionKey]) : null}</View>
                <View style={{ ...styles.tableCellLast, flex: 1 }}><Text style={styles.tableCellText}>{onboardingRequest[item.notesKey] || ''}</Text></View>
              </View>
            );
          })}
        </View>

        {/* Approval Footer - 3 columns */}
        <View style={styles.approvalContainer}>
          {/* EK: ZİMMET TUTANAĞI */}
          <View style={styles.approvalColumn}>
            <Text style={styles.approvalTitle}>EK: ZİMMET TUTANAĞI</Text>
          </View>
          {/* FORM İÇERİĞİ KONTROLÜ - second-to-last approver */}
          <View style={styles.approvalColumn}>
            <Text style={styles.approvalTitle}>FORM İÇERİĞİ KONTROLÜ</Text>
            {secondToLastApproval ? (
              <>
                <Text style={styles.approvalSubtitle}>{(secondToLastApproval.workflow_step.static_position?.title || secondToLastApproval.workflow_step.name || '').toUpperCase()}</Text>
                <Text style={styles.approvalName}>{secondToLastApproval.approver.first_name} {secondToLastApproval.approver.last_name}</Text>
                {secondToLastApproval.decided_at ? <Text style={styles.approvalName}>{formatTrDate(secondToLastApproval.decided_at)}</Text> : null}
                {renderSignature(secondToLastApproval.approver.id, false, secondToLastApproval.status)}
              </>
            ) : null}
          </View>
          {/* ONAY - last approver */}
          <View style={styles.approvalColumnLast}>
            <Text style={styles.approvalTitle}>ONAY</Text>
            {lastApproval ? (
              <>
                <Text style={styles.approvalSubtitle}>{(lastApproval.workflow_step.static_position?.title || lastApproval.workflow_step.name || '').toUpperCase()}</Text>
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

