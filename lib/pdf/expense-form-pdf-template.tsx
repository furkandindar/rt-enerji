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
  grey: '#666666',
  greyLight: '#B0B0B0',
};

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Roboto', backgroundColor: colors.white },

  // Header
  headerContainer: { flexDirection: 'row', borderWidth: 1, borderColor: colors.black },
  logoCell: { width: 70, padding: 6, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  logoImage: { width: 50, height: 35, objectFit: 'contain' },
  titleCell: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 6 },
  titleText: { fontSize: 13, fontWeight: 700 },
  logoRightCell: { width: 70, padding: 6, borderLeftWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },

  // Section
  sectionHeader: { backgroundColor: colors.orange, padding: 4, borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  sectionHeaderText: { color: colors.white, fontSize: 9, fontWeight: 700, textAlign: 'center' },

  // Info table
  infoTable: { borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  infoRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 20 },
  infoRowLast: { flexDirection: 'row', minHeight: 20 },
  infoLabel: { width: '25%', backgroundColor: colors.orangeLight, padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  infoValue: { width: '25%', padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  infoValueLast: { width: '25%', padding: 4, justifyContent: 'center' },
  infoText: { fontSize: 9 },
  infoLabelText: { fontSize: 9, fontWeight: 500 },

  // Items table
  itemsTable: { marginTop: 12, borderWidth: 1, borderColor: colors.black },
  itemsHeaderRow: { flexDirection: 'row', backgroundColor: colors.orangeLight, minHeight: 24 },
  itemsHeaderCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  itemsHeaderText: { fontSize: 9, fontWeight: 700, textAlign: 'center' },
  itemsRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 20 },
  itemsCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  itemsCellLast: { padding: 4, justifyContent: 'center' },
  itemsText: { fontSize: 9 },
  itemsTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 22, backgroundColor: colors.orangeLight },
  itemsTotalLabel: { padding: 4, justifyContent: 'center', alignItems: 'flex-end', borderRightWidth: 1, borderColor: colors.black },
  itemsTotalValue: { padding: 4, justifyContent: 'center', alignItems: 'flex-end' },
  itemsTotalText: { fontSize: 9, fontWeight: 700 },

  // Column widths (sum = 100%)
  colNo:    { width: '6%' },
  colDate:  { width: '14%' },
  colDoc:   { width: '14%' },
  colDesc:  { width: '52%' },
  colAmt:   { width: '14%' },

  // Summary block
  summaryBlock: { marginTop: 12, borderWidth: 1, borderColor: colors.black, alignSelf: 'flex-end', width: '50%' },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.black, minHeight: 20 },
  summaryRowLast: { flexDirection: 'row', minHeight: 20 },
  summaryLabel: { width: '60%', padding: 4, backgroundColor: colors.orangeLight, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  summaryValue: { width: '40%', padding: 4, justifyContent: 'center', alignItems: 'flex-end' },
  summaryText: { fontSize: 9 },
  summaryStrong: { fontSize: 9, fontWeight: 700 },

  // Approval section
  onayHeader: { backgroundColor: colors.orange, padding: 4, borderWidth: 1, borderColor: colors.black, marginTop: 16 },
  onayHeaderText: { color: colors.white, fontSize: 9, fontWeight: 700, textAlign: 'center' },
  onayContent: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black },
  onayColumn: { flex: 1, borderRightWidth: 1, borderColor: colors.black },
  onayColumnLast: { flex: 1 },
  onayTitleRow: { backgroundColor: colors.orangeLight, padding: 4, borderBottomWidth: 1, borderColor: colors.black, minHeight: 22, justifyContent: 'center', alignItems: 'center' },
  onayTitleText: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
  onaySignatureRow: { padding: 4, minHeight: 50, justifyContent: 'center', alignItems: 'center' },
  onayNameText: { fontSize: 8, textAlign: 'center', marginBottom: 2 },
  onayNoteRow: { padding: 4, minHeight: 16, borderTopWidth: 1, borderColor: colors.greyLight },
  onayNoteText: { fontSize: 6, color: colors.grey, lineHeight: 1.3 },

  signatureText: { fontSize: 14, color: '#1a365d' },
  signaturePending: { fontSize: 7, color: colors.grey },

  // Footer
  footer: { position: 'absolute', bottom: 14, left: 24, right: 24, borderTopWidth: 1, borderColor: colors.black, paddingTop: 4, alignItems: 'center' },
  footerTitle: { fontSize: 7, fontWeight: 700 },
  footerText: { fontSize: 6, color: colors.grey, textAlign: 'center' },
});

interface SignatureInfo { text: string; font: SignatureFont; }

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ExpenseFormPDFTemplateProps {
  request: any;
  requester: any;
  expenseRequest: any;
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const formatAmount = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
};

const getRequesterPosition = (requester: { employee_positions?: Array<{ is_primary: boolean; end_date: string | null; position?: { title: string } }> } | undefined): string => {
  if (!requester?.employee_positions) return '-';
  const primary = requester.employee_positions.find((ep) => ep.is_primary && !ep.end_date);
  return primary?.position?.title || '-';
};


export const ExpenseFormPDFTemplate: React.FC<ExpenseFormPDFTemplateProps> = ({
  request,
  requester,
  expenseRequest,
  approvals,
  signatures = {},
}) => {
  const renderSignature = (employeeId: string) => {
    const sig = signatures[employeeId];
    if (sig) return <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return <Text style={styles.signaturePending}>İmza</Text>;
  };

  const items = [...(expenseRequest.items || [])].sort(
    (a, b) => (a.row_order ?? 0) - (b.row_order ?? 0)
  );
  const totalAmount = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const advance = Number(expenseRequest.advance_amount || 0);
  const balance = advance - totalAmount;

  // Onay kolonları: Talep Eden + sıralı onaylayanlar
  const approvalColumns: Array<{ title: string; name: string; employeeId: string; note: string }> = [
    {
      title: 'Talep Eden',
      name: `${requester.first_name} ${requester.last_name}`,
      employeeId: requester.id,
      note: '',
    },
  ];
  const sortedApprovals = [...approvals]
    .filter((a) => a.workflow_step?.step_order > 1)
    .sort((a, b) => (a.workflow_step?.step_order ?? 0) - (b.workflow_step?.step_order ?? 0));
  sortedApprovals.forEach((a) => {
    const title = a.workflow_step?.static_position?.title || a.workflow_step?.name || '-';
    approvalColumns.push({
      title,
      name: `${a.approver?.first_name ?? ''} ${a.approver?.last_name ?? ''}`.trim(),
      employeeId: a.approver?.id,
      note: a.comment || '',
    });
  });

  const isTravel = expenseRequest.is_travel === true;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
          <View style={styles.titleCell}><Text style={styles.titleText}>HARCAMA FORMU</Text></View>
          <View style={styles.logoRightCell}><Image src={getLogoPath()} style={styles.logoImage} /></View>
        </View>

        {/* Talep Bilgileri */}
        <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>TALEP BİLGİLERİ</Text></View>
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Adı / Soyadı</Text></View>
            <View style={styles.infoValue}><Text style={styles.infoText}>{requester.first_name} {requester.last_name}</Text></View>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Unvanı</Text></View>
            <View style={styles.infoValueLast}><Text style={styles.infoText}>{getRequesterPosition(requester)}</Text></View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Tarih</Text></View>
            <View style={styles.infoValue}><Text style={styles.infoText}>{format(new Date(expenseRequest.request_date), 'dd.MM.yyyy')}</Text></View>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Form Tarihi</Text></View>
            <View style={styles.infoValueLast}><Text style={styles.infoText}>{format(new Date(request.created_at), 'dd.MM.yyyy')}</Text></View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Proje Adı</Text></View>
            <View style={styles.infoValue}><Text style={styles.infoText}>{expenseRequest.project_name}</Text></View>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Proje Kodu</Text></View>
            <View style={styles.infoValueLast}><Text style={styles.infoText}>{expenseRequest.project_code}</Text></View>
          </View>
          <View style={isTravel ? styles.infoRow : styles.infoRowLast}>
            <View style={styles.infoLabel}><Text style={styles.infoLabelText}>{isTravel ? 'Seyahat Yapılan Yer' : 'İşin Adı'}</Text></View>
            <View style={[styles.infoValueLast, { width: '75%' }]}><Text style={styles.infoText}>{expenseRequest.work_or_destination}</Text></View>
          </View>
          {isTravel && (
            <View style={styles.infoRowLast}>
              <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Kişi Sayısı</Text></View>
              <View style={styles.infoValue}><Text style={styles.infoText}>{expenseRequest.travel_person_count ?? '-'}</Text></View>
              <View style={styles.infoLabel}><Text style={styles.infoLabelText}>Seyahat Tarihi / Süresi</Text></View>
              <View style={styles.infoValueLast}>
                <Text style={styles.infoText}>
                  {expenseRequest.travel_date ? format(new Date(expenseRequest.travel_date), 'dd.MM.yyyy') : '-'}
                  {expenseRequest.travel_duration ? `  •  ${expenseRequest.travel_duration}` : ''}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Harcama Kalemleri */}
        <View style={styles.itemsTable}>
          <View style={styles.itemsHeaderRow}>
            <View style={[styles.itemsHeaderCell, styles.colNo]}><Text style={styles.itemsHeaderText}>Sıra No</Text></View>
            <View style={[styles.itemsHeaderCell, styles.colDate]}><Text style={styles.itemsHeaderText}>Tarih</Text></View>
            <View style={[styles.itemsHeaderCell, styles.colDoc]}><Text style={styles.itemsHeaderText}>Evrak No</Text></View>
            <View style={[styles.itemsHeaderCell, styles.colDesc]}><Text style={styles.itemsHeaderText}>Açıklama</Text></View>
            <View style={[styles.itemsHeaderCell, styles.colAmt, { borderRightWidth: 0 }]}><Text style={styles.itemsHeaderText}>Tutar (TL)</Text></View>
          </View>
          {items.map((it, idx) => (
            <View key={it.id || idx} style={styles.itemsRow} wrap={false}>
              <View style={[styles.itemsCell, styles.colNo, { alignItems: 'center' }]}><Text style={styles.itemsText}>{it.row_order ?? idx + 1}</Text></View>
              <View style={[styles.itemsCell, styles.colDate]}><Text style={styles.itemsText}>{format(new Date(it.item_date), 'dd.MM.yyyy')}</Text></View>
              <View style={[styles.itemsCell, styles.colDoc]}><Text style={styles.itemsText}>{it.document_no || '-'}</Text></View>
              <View style={[styles.itemsCell, styles.colDesc]}><Text style={styles.itemsText}>{it.description}</Text></View>
              <View style={[styles.itemsCellLast, styles.colAmt, { alignItems: 'flex-end' }]}><Text style={styles.itemsText}>{formatAmount(Number(it.amount))}</Text></View>
            </View>
          ))}
          <View style={styles.itemsTotalRow} wrap={false}>
            <View style={[styles.itemsTotalLabel, { width: '86%' }]}><Text style={styles.itemsTotalText}>Toplam</Text></View>
            <View style={[styles.itemsTotalValue, styles.colAmt]}><Text style={styles.itemsTotalText}>{formatAmount(totalAmount)}</Text></View>
          </View>
        </View>

        {/* Özet (Avans / Toplam / Bakiye) */}
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabel}><Text style={styles.summaryText}>Avans Tutarı (a)</Text></View>
            <View style={styles.summaryValue}><Text style={styles.summaryText}>{formatAmount(advance)} TL</Text></View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabel}><Text style={styles.summaryText}>Harcamalar Toplamı (b)</Text></View>
            <View style={styles.summaryValue}><Text style={styles.summaryText}>{formatAmount(totalAmount)} TL</Text></View>
          </View>
          <View style={styles.summaryRowLast}>
            <View style={styles.summaryLabel}><Text style={styles.summaryStrong}>Bakiye Tutar (a-b)</Text></View>
            <View style={styles.summaryValue}><Text style={styles.summaryStrong}>{formatAmount(balance)} TL</Text></View>
          </View>
        </View>

        {/* ONAY */}
        <View style={styles.onayHeader}><Text style={styles.onayHeaderText}>ONAY</Text></View>
        <View style={styles.onayContent}>
          {approvalColumns.map((col, index) => (
            <View key={index} style={index === approvalColumns.length - 1 ? styles.onayColumnLast : styles.onayColumn}>
              <View style={styles.onayTitleRow}><Text style={styles.onayTitleText}>{col.title}</Text></View>
              <View style={styles.onaySignatureRow}>
                {renderSignature(col.employeeId)}
                <Text style={styles.onayNameText}>{col.name}</Text>
              </View>
              {col.note ? (
                <View style={styles.onayNoteRow}><Text style={styles.onayNoteText}>{col.note}</Text></View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerTitle}>RT ENERJİ TURİZM SANAYİ VE TİCARET ANONİM ŞİRKETİ</Text>
          <Text style={styles.footerText}>Kemerağzı Mahallesi, Yaşar Sobutay Bulvarı, No:70, Aksu - Antalya</Text>
          <Text style={styles.footerText}>
            Antalya Kurumlar V.D.: 735 126 22 01 - Mersis No: 0-7351-2622-0100001 - Tic. Sic. No: 101091
          </Text>
          <Text style={styles.footerText}>www.rtenerji.com</Text>
        </View>
      </Page>
    </Document>
  );
};

