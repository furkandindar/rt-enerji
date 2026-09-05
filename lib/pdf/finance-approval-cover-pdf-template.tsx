import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import type { PdfApproval, SignatureInfo } from './types';
import { formatMoney, sumItemsByCurrency, joinCurrencyTotals } from '@/lib/currency';
import { CoverHeader, CoverTitleBlock, CoverEvalGrid, CoverFooter, FOOTER_RESERVED_BOTTOM, yesNo, breakLongTokens } from './approval-cover-shared';

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
  grey: '#666666',
  greenHeader: '#A8C686',
  borderGrey: '#B0B0B0',
};

const expenseAreaLabels: Record<string, string> = {
  ANA_SAHA: 'ANA SAHA',
  ELEKTRIKSEL_KAPASITE_ARTISI: 'ELEKTRİKSEL KAPASİTE ARTIŞI',
  YEKA_1: 'YEKA 1',
  YEKA_2: 'YEKA 2',
};

const fundingSourceLabels: Record<string, string> = {
  KREDI: 'KREDİ',
  OZ_KAYNAK: 'ÖZ KAYNAK',
  NAKIT_FAZLASI: 'NAKİT FAZLASI',
  DIGER: 'DİĞER',
};

// Şirket kurucusu — sistem üzerinden onay vermiyor, PDF çıktısı alınıp fiziksel olarak imzalanıyor.
const FOUNDER_NAME = 'RAMAZAN TAŞ';

const styles = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 30, paddingBottom: FOOTER_RESERVED_BOTTOM, fontSize: 9, fontFamily: 'Roboto', backgroundColor: colors.white },

  // Payment table
  paymentTable: { marginTop: 8, borderWidth: 1, borderColor: colors.black },
  paymentHeaderRow: { flexDirection: 'row', backgroundColor: colors.greenHeader, minHeight: 26 },
  paymentHeaderCell: { paddingVertical: 2, paddingHorizontal: 3, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  paymentHeaderText: { fontSize: 7.5, fontWeight: 700, textAlign: 'center' },
  paymentRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 18 },
  paymentCell: { paddingVertical: 2, paddingHorizontal: 3, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  paymentCellLast: { paddingVertical: 2, paddingHorizontal: 3, justifyContent: 'center' },
  paymentText: { fontSize: 7.5 },
  paymentTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 18 },
  paymentTotalCell: { paddingVertical: 2, paddingHorizontal: 3, justifyContent: 'center', alignItems: 'flex-end' },
  paymentTotalText: { fontSize: 9, fontWeight: 700 },

  // Column widths — sum must equal 100% (Konu en geniş: uzun poliçe/fatura açıklamaları sarmasın)
  colIdx:    { width: '4%' },
  colDate:   { width: '10%' },
  colCompany:{ width: '16%' },
  colPayee:  { width: '18%' },
  colSubject:{ width: '28%' },
  colInvoice:{ width: '12%' },
  colPayable:{ width: '12%' },


  // Opsiyonel ödeme tablosu (olur yazısındaki blokla aynı görünüm)
  payTableSection: { marginTop: 10, marginBottom: 4 },
  payTableTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4, textAlign: 'center' },
  payTableRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: colors.black, minHeight: 18 },
  payTableFirstRow: { borderTopWidth: 1 },
  payTableLabel: { width: '45%', padding: 4, borderRightWidth: 1, borderColor: colors.black, fontWeight: 500, fontSize: 9 },
  payTableValue: { flex: 1, padding: 4, fontSize: 9 },

  // İlgililer section
  ilgilerSection: { marginTop: 14 },
  ilgilerHeader: { fontSize: 10, fontWeight: 700 },
  ilgilerSubNote: { fontSize: 7, color: colors.grey, marginBottom: 8 },
  ilgilerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  ilgilerCell: { width: '25%', padding: 4, alignItems: 'center', minHeight: 50 },
  ilgilerName: { fontSize: 7, textAlign: 'center', marginTop: 2 },
  ilgilerNote: { fontSize: 6, color: colors.grey, textAlign: 'center', marginTop: 1 },

  // İmza bandı: Genel Müdür (sol) / ONAY (orta) / Müdür (sağ) tek satırda
  signatureBand: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 20 },
  bandLeft: { width: '33%', alignItems: 'flex-start' },
  bandCenter: { width: '34%', alignItems: 'center' },
  bandRight: { width: '33%', alignItems: 'flex-end' },

  // Sağ: statik onaycı (Müdür)
  staticTitleRight: { fontSize: 8, fontWeight: 700, textAlign: 'right', marginBottom: 2 },
  staticSubtitleRight: { fontSize: 8, fontWeight: 700, textAlign: 'right', marginBottom: 4 },
  staticNameRight: { fontSize: 9, fontWeight: 700, textAlign: 'right', marginTop: 2 },
  staticCommentRight: { fontSize: 7, color: colors.grey, textAlign: 'right', marginTop: 2 },

  // Sol: Genel Müdür (dinamik imza)
  genelMudurName: { fontSize: 9, fontWeight: 700, marginTop: 2 },
  genelMudurComment: { fontSize: 7, color: colors.grey, marginTop: 2 },

  // Orta: ONAY (şirket kurucusu, fiziksel olarak imzalanacak — ıslak imza için boşluk)
  onayHeader: { fontSize: 11, fontWeight: 700, marginBottom: 26 },
  onayName: { fontSize: 10, fontWeight: 700 },

  // Signatures
  signatureText: { fontSize: 16, color: '#1a365d' },
  signaturePending: { fontSize: 7, color: colors.grey },
  onBehalfNote: { fontSize: 6.5, color: colors.grey, marginTop: 1 },

});

interface FinanceItem {
  id?: string | null;
  row_order?: number | null;
  item_date: string;
  company_name: string | null;
  payee_name: string | null;
  item_subject: string | null;
  invoice_amount: number | string | null;
  payable_amount: number | string | null;
  currency?: string | null;
}

interface FinanceRequest {
  subject: string | null;
  request_date: string;
  document_no: string | null;
  items?: FinanceItem[] | null;
  account_available?: boolean | null;
  cash_flow_recorded?: boolean | null;
  expense_area?: 'ANA_SAHA' | 'ELEKTRIKSEL_KAPASITE_ARTISI' | 'YEKA_1' | 'YEKA_2' | string | null;
  funding_source?: 'KREDI' | 'OZ_KAYNAK' | 'NAKIT_FAZLASI' | 'DIGER' | string | null;
  has_rt_enerji_proforma?: boolean | null;
  // Opsiyonel ödeme tablosu (olur yazısındaki blokla aynı yapı)
  has_payment_table?: boolean | null;
  comparison_approval_date?: string | null;
  agreement_amount?: string | null;
  has_contract?: boolean | null;
  paid_amounts?: string[] | null;
  remaining_payment?: string | null;
  requested_payment_amount?: string | null;
  remaining_after_payment?: string | null;
}

interface FinanceApprovalCoverPDFTemplateProps {
  financeRequest: FinanceRequest;
  approvals: PdfApproval[];
  signatures?: Record<string, SignatureInfo>;
}

export const FinanceApprovalCoverPDFTemplate: React.FC<FinanceApprovalCoverPDFTemplateProps> = ({
  financeRequest,
  approvals,
  signatures = {},
}) => {
  const renderSignature = (employeeId: string, status?: string) => {
    if (status === 'REJECTED') {
      return <Text style={{ fontSize: 9, fontWeight: 700, color: '#DC2626' }}>Reddedildi</Text>;
    }
    const sig = signatures[employeeId];
    if (sig) {
      return (
        <>
          <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>
          {/* Vekalet (Faz B): imza vekile aitse etiket — ad/ünvan kolonu onaycınındır */}
          {sig.onBehalfNote ? <Text style={styles.onBehalfNote}>{sig.onBehalfNote}</Text> : null}
        </>
      );
    }
    return <Text style={styles.signaturePending}>İmza</Text>;
  };

  const items = [...(financeRequest.items || [])].sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0));
  const totalPayableText = joinCurrencyTotals(sumItemsByCurrency(items), 'payable');

  // Approval gruplaması: step_order'a göre
  const isYkbSignedPdf = (a: PdfApproval) =>
    a.workflow_step?.phase === 'COMPLETION' && a.workflow_step?.form_section_key === 'ykb_signed_pdf';
  const dynamicApprovals = approvals.filter((a) => a.workflow_step?.approver_type === 'DYNAMIC_USER_LIST');
  const staticApprovals = approvals
    .filter((a) => a.workflow_step?.approver_type === 'STATIC_POSITION' && !isYkbSignedPdf(a))
    .sort((a, b) => (a.workflow_step?.step_order ?? 0) - (b.workflow_step?.step_order ?? 0));
  const finansMuduru = staticApprovals[0];
  const genelMudur = staticApprovals[staticApprovals.length - 1];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <CoverHeader title="FİNANS ONAY KAPAĞI" />
        <CoverTitleBlock
          subject={financeRequest.subject}
          documentNo={financeRequest.document_no}
          requestDate={financeRequest.request_date}
        />

        {/* Ödeme Kalemleri Tablosu */}
        <View style={styles.paymentTable}>
          <View style={styles.paymentHeaderRow}>
            <View style={[styles.paymentHeaderCell, styles.colIdx]}><Text style={styles.paymentHeaderText}></Text></View>
            <View style={[styles.paymentHeaderCell, styles.colDate]}><Text style={styles.paymentHeaderText}>Tarih</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colCompany]}><Text style={styles.paymentHeaderText}>FİRMA ADI</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colPayee]}><Text style={styles.paymentHeaderText}>Ödeme Yapılacak{'\n'}Firma/Kurum</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colSubject]}><Text style={styles.paymentHeaderText}>Konu</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colInvoice]}><Text style={styles.paymentHeaderText}>Fatura{'\n'}Tutarı</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colPayable, { borderRightWidth: 0 }]}><Text style={styles.paymentHeaderText}>Ödenecek{'\n'}Tutar</Text></View>
          </View>
          {items.map((it, idx) => (
            <View key={it.id || idx} style={styles.paymentRow} wrap={false}>
              <View style={[styles.paymentCell, styles.colIdx]}><Text style={styles.paymentText}>{idx + 1}</Text></View>
              <View style={[styles.paymentCell, styles.colDate]}><Text style={styles.paymentText}>{format(new Date(it.item_date), 'dd.MM.yyyy')}</Text></View>
              <View style={[styles.paymentCell, styles.colCompany]}><Text style={styles.paymentText}>{breakLongTokens(it.company_name)}</Text></View>
              <View style={[styles.paymentCell, styles.colPayee]}><Text style={styles.paymentText}>{breakLongTokens(it.payee_name)}</Text></View>
              <View style={[styles.paymentCell, styles.colSubject]}><Text style={styles.paymentText}>{breakLongTokens(it.item_subject)}</Text></View>
              <View style={[styles.paymentCell, styles.colInvoice, { alignItems: 'flex-end' }]}><Text style={styles.paymentText}>{formatMoney(Number(it.invoice_amount), it.currency)}</Text></View>
              <View style={[styles.paymentCellLast, styles.colPayable, { alignItems: 'flex-end' }]}><Text style={styles.paymentText}>{formatMoney(Number(it.payable_amount), it.currency)}</Text></View>
            </View>
          ))}
          {/* Toplam satırı — para birimi bazında ("1.000,00 TL + 500,00 EUR") */}
          <View style={styles.paymentTotalRow} wrap={false}>
            <View style={[styles.paymentCell, { width: '70%', borderRightWidth: 1, alignItems: 'flex-end' }]}><Text style={styles.paymentTotalText}></Text></View>
            <View style={[styles.paymentTotalCell, { width: '30%' }]}><Text style={styles.paymentTotalText}>{totalPayableText}</Text></View>
          </View>
        </View>

        {/* Değerlendirme — sadece verilen cevaplar, satır başına 3 kalem */}
        <CoverEvalGrid
          items={[
            { label: 'HESAP MÜSAİT Mİ?', value: yesNo(financeRequest.account_available, 'EVET', 'HAYIR') },
            { label: 'NAKİT GİRİŞ / ÇIKIŞ KAYDI', value: yesNo(financeRequest.cash_flow_recorded, 'YAPILDI', 'YAPILMADI') },
            { label: 'RT ENERJİ PROFORMA', value: yesNo(financeRequest.has_rt_enerji_proforma, 'VAR', 'YOK'), note: '(Taşeron ise)' },
            { label: 'NİTELİĞİ', value: fundingSourceLabels[financeRequest.funding_source ?? ''] ?? financeRequest.funding_source },
            { label: 'HARCAMA ALANI', value: expenseAreaLabels[financeRequest.expense_area ?? ''] ?? financeRequest.expense_area },
          ]}
        />

        {/* Opsiyonel Ödeme Tablosu (olur yazısındaki blokla aynı) */}
        {financeRequest.has_payment_table && (
          <View style={styles.payTableSection}>
            <Text style={styles.payTableTitle}>ÖDEME TABLOSU</Text>
            <View style={[styles.payTableRow, styles.payTableFirstRow]}>
              <Text style={styles.payTableLabel}>Karşılaştırma Onay Tarihi</Text>
              <Text style={styles.payTableValue}>{financeRequest.comparison_approval_date ? format(new Date(financeRequest.comparison_approval_date), 'dd.MM.yyyy') : '-'}</Text>
            </View>
            <View style={styles.payTableRow}>
              <Text style={styles.payTableLabel}>Anlaşma Tutarı</Text>
              <Text style={styles.payTableValue}>{financeRequest.agreement_amount || '-'}</Text>
            </View>
            <View style={styles.payTableRow}>
              <Text style={styles.payTableLabel}>Sözleşme</Text>
              <Text style={styles.payTableValue}>{financeRequest.has_contract ? 'VAR' : 'YOK'}</Text>
            </View>
            {(financeRequest.paid_amounts || []).map((amount: string, idx: number) => (
              <View key={idx} style={styles.payTableRow}>
                <Text style={styles.payTableLabel}>Ödenen ({idx + 1})</Text>
                <Text style={styles.payTableValue}>{amount || '-'}</Text>
              </View>
            ))}
            <View style={styles.payTableRow}>
              <Text style={styles.payTableLabel}>Kalan Ödeme</Text>
              <Text style={styles.payTableValue}>{financeRequest.remaining_payment || '-'}</Text>
            </View>
            <View style={styles.payTableRow}>
              <Text style={styles.payTableLabel}>Ödenmesi Talep Edilen Tutar</Text>
              <Text style={styles.payTableValue}>{financeRequest.requested_payment_amount || '-'}</Text>
            </View>
            <View style={styles.payTableRow}>
              <Text style={styles.payTableLabel}>Bu Ödeme Sonrası Kalan Ödeme</Text>
              <Text style={styles.payTableValue}>{financeRequest.remaining_after_payment || '-'}</Text>
            </View>
          </View>
        )}

        {/* İLGİLİLER* — dinamik onaycılar */}
        <View style={styles.ilgilerSection}>
          <Text style={styles.ilgilerHeader}>İLGİLİLER*</Text>
          <Text style={styles.ilgilerSubNote}>(İşin yapıldığına/Malın teslimine ilişkin yazılı belge/Onay)</Text>
          {dynamicApprovals.length > 0 ? (
            <View style={styles.ilgilerGrid}>
              {dynamicApprovals.map((a, idx) => (
                <View key={a.id || idx} style={styles.ilgilerCell}>
                  {renderSignature(a.approver?.id, a.status)}
                  <Text style={styles.ilgilerName}>
                    {a.approver?.first_name} {a.approver?.last_name}
                  </Text>
                  {a.comment ? <Text style={styles.ilgilerNote}>{a.comment}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* İmza bandı: Genel Müdür (sol) / ONAY (orta) / Finans Müdürü (sağ) */}
        <View style={styles.signatureBand} wrap={false}>
          <View style={styles.bandLeft}>
            {genelMudur && genelMudur !== finansMuduru ? (
              <>
                {renderSignature(genelMudur.approver?.id, genelMudur.status)}
                <Text style={styles.genelMudurName}>
                  {genelMudur.approver?.first_name} {genelMudur.approver?.last_name}
                </Text>
                {genelMudur.comment ? <Text style={styles.genelMudurComment}>{genelMudur.comment}</Text> : null}
              </>
            ) : null}
          </View>
          <View style={styles.bandCenter}>
            <Text style={styles.onayHeader}>ONAY</Text>
            <Text style={styles.onayName}>{FOUNDER_NAME}</Text>
          </View>
          <View style={styles.bandRight}>
            {finansMuduru ? (
              <>
                <Text style={styles.staticTitleRight}>Onaylı dayanak belge kontrol edilmiştir.</Text>
                <Text style={styles.staticSubtitleRight}>
                  {finansMuduru.workflow_step?.name || finansMuduru.workflow_step?.static_position?.title || 'İlgili Birim Yetkilisi / Müdürü'}
                </Text>
                {renderSignature(finansMuduru.approver?.id, finansMuduru.status)}
                <Text style={styles.staticNameRight}>
                  {finansMuduru.approver?.first_name} {finansMuduru.approver?.last_name}
                </Text>
                {finansMuduru.comment ? <Text style={styles.staticCommentRight}>{finansMuduru.comment}</Text> : null}
              </>
            ) : null}
          </View>
        </View>

        <CoverFooter />
      </Page>
    </Document>
  );
};
