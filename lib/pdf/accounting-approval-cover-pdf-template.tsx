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
  black: '#000000',
  white: '#FFFFFF',
  grey: '#666666',
  purpleHeader: '#C7B8E8',
  borderGrey: '#B0B0B0',
};

// Şirket kurucusu — sistem üzerinden onay vermiyor, PDF çıktısı alınıp fiziksel olarak imzalanıyor.
const FOUNDER_NAME = 'RAMAZAN TAŞ';

const capacityShortLabel: Record<string, string> = {
  KAPASITE: 'K',
  ANASAHA: 'A',
  YEKA: 'YEKA',
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Roboto', backgroundColor: colors.white },

  // Header
  logoContainer: { alignItems: 'center', marginBottom: 8 },
  logoImage: { width: 120, height: 40, objectFit: 'contain' },
  headerLine: { borderBottomWidth: 1.5, borderColor: colors.black, marginBottom: 14 },

  // Title block (Konu / Tarih / Sayı)
  titleRow: { flexDirection: 'row', marginBottom: 6 },
  titleLabel: { fontSize: 10, fontWeight: 700 },
  titleValue: { fontSize: 10 },

  // Payment table
  paymentTable: { marginTop: 8, borderWidth: 1, borderColor: colors.black },
  paymentHeaderRow: { flexDirection: 'row', backgroundColor: colors.purpleHeader, minHeight: 32 },
  paymentHeaderCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center', alignItems: 'center' },
  paymentHeaderText: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
  paymentRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 22 },
  paymentCell: { padding: 4, borderRightWidth: 1, borderColor: colors.black, justifyContent: 'center' },
  paymentCellLast: { padding: 4, justifyContent: 'center' },
  paymentText: { fontSize: 8 },
  paymentTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.black, minHeight: 22 },
  paymentTotalCell: { padding: 4, justifyContent: 'center', alignItems: 'flex-end' },
  paymentTotalText: { fontSize: 9, fontWeight: 700 },

  // Column widths — sum must equal 100% (7 columns: idx, date, company, payee, subject, capacity, invoice, payable)
  colIdx:     { width: '5%' },
  colDate:    { width: '10%' },
  colCompany: { width: '18%' },
  colPayee:   { width: '19%' },
  colSubject: { width: '16%' },
  colCap:     { width: '8%' },
  colInvoice: { width: '12%' },
  colPayable: { width: '12%' },

  // Evaluation rows
  evalBlock: { marginTop: 16 },
  evalRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'center' },
  evalLabel: { fontSize: 9, fontWeight: 700, width: 195 },
  evalValue: { fontSize: 9, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  evalItemText: { fontSize: 9, marginRight: 3 },
  checkBox: { width: 11, height: 11, borderWidth: 1, borderColor: colors.black, marginRight: 3, marginLeft: 2, position: 'relative' },
  checkMark: { position: 'absolute', top: -2, left: 1, fontSize: 11, fontWeight: 700, lineHeight: 1, color: colors.black },

  // Static note below evaluations
  staticInfoNote: { fontSize: 9, fontWeight: 700, marginTop: 8, marginBottom: 4 },

  // İlgililer section
  ilgilerSection: { marginTop: 14 },
  ilgilerHeader: { fontSize: 10, fontWeight: 700 },
  ilgilerSubNote: { fontSize: 7, color: colors.grey, marginBottom: 8 },
  ilgilerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  ilgilerCell: { width: '25%', padding: 4, alignItems: 'center', minHeight: 50 },
  ilgilerName: { fontSize: 7, textAlign: 'center', marginTop: 2 },
  ilgilerNote: { fontSize: 6, color: colors.grey, textAlign: 'center', marginTop: 1 },

  // Right-aligned static approver (Muhasebe Müdürü)
  staticApproverRight: { marginTop: 18, alignItems: 'flex-end', paddingRight: 20 },
  staticTitleRight: { fontSize: 8, fontWeight: 700, textAlign: 'right', marginBottom: 2 },
  staticSubtitleRight: { fontSize: 8, fontWeight: 700, textAlign: 'right', marginBottom: 4 },
  staticNameRight: { fontSize: 9, fontWeight: 700, textAlign: 'right', marginTop: 2 },
  staticCommentRight: { fontSize: 7, color: colors.grey, textAlign: 'right', marginTop: 2, maxWidth: 220 },

  // Genel Müdür (sola yaslı, dinamik imza)
  genelMudurBlock: { marginTop: 18, alignItems: 'flex-start' },
  genelMudurName: { fontSize: 9, fontWeight: 700, marginTop: 2 },
  genelMudurComment: { fontSize: 7, color: colors.grey, marginTop: 2, maxWidth: 220 },

  // ONAY center
  onayCenter: { marginTop: 36, alignItems: 'center' },
  onayHeader: { fontSize: 11, fontWeight: 700, marginBottom: 22 },
  onayName: { fontSize: 10, fontWeight: 700 },

  // Signatures
  signatureText: { fontSize: 16, color: '#1a365d' },
  signaturePending: { fontSize: 7, color: colors.grey },

  // Footer
  footer: { position: 'absolute', bottom: 18, left: 30, right: 30, borderTopWidth: 1, borderColor: colors.black, paddingTop: 4, alignItems: 'center' },
  footerTitle: { fontSize: 7, fontWeight: 700 },
  footerText: { fontSize: 6, color: colors.grey, textAlign: 'center' },
});

interface SignatureInfo { text: string; font: SignatureFont; }

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AccountingApprovalCoverPDFTemplateProps {
  request: any;
  requester: any;
  accountingRequest: any;
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const formatAmount = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
};

const CheckBox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <View style={styles.checkBox}>{checked ? <Text style={styles.checkMark}>X</Text> : null}</View>
);

export const AccountingApprovalCoverPDFTemplate: React.FC<AccountingApprovalCoverPDFTemplateProps> = ({
  accountingRequest,
  approvals,
  signatures = {},
}) => {
  const renderSignature = (employeeId: string) => {
    const sig = signatures[employeeId];
    if (sig) return <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>;
    return <Text style={styles.signaturePending}>İmza</Text>;
  };

  const items = [...(accountingRequest.items || [])].sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0));
  const totalPayable = items.reduce((sum, it) => sum + Number(it.payable_amount || 0), 0);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const dynamicApprovals = approvals.filter((a: any) => a.workflow_step?.approver_type === 'DYNAMIC_USER_LIST');
  const staticApprovals = approvals
    .filter((a: any) => a.workflow_step?.approver_type === 'STATIC_POSITION')
    .sort((a: any, b: any) => (a.workflow_step?.step_order ?? 0) - (b.workflow_step?.step_order ?? 0));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const muhasebeMuduru = staticApprovals[0];
  const genelMudur = staticApprovals[staticApprovals.length - 1];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Logo + horizontal line */}
        <View style={styles.logoContainer}><Image src={getLogoPath()} style={styles.logoImage} /></View>
        <View style={styles.headerLine} />

        {/* Başlık: Konu / Tarih / Sayı */}
        <View style={styles.titleRow}>
          <Text style={styles.titleLabel}>Konu: </Text>
          <Text style={styles.titleValue}>{accountingRequest.subject}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.titleLabel}>Tarih: </Text>
          <Text style={styles.titleValue}>{format(new Date(accountingRequest.request_date), 'dd.MM.yyyy')}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.titleLabel}>Sayı: </Text>
          <Text style={styles.titleValue}>{accountingRequest.document_no}</Text>
        </View>

        {/* Ödeme Kalemleri Tablosu */}
        <View style={styles.paymentTable}>
          <View style={styles.paymentHeaderRow}>
            <View style={[styles.paymentHeaderCell, styles.colIdx]}><Text style={styles.paymentHeaderText}></Text></View>
            <View style={[styles.paymentHeaderCell, styles.colDate]}><Text style={styles.paymentHeaderText}>Tarih</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colCompany]}><Text style={styles.paymentHeaderText}>FİRMA ADI</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colPayee]}><Text style={styles.paymentHeaderText}>Ödeme Yapılacak{'\n'}Firma/Kurum</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colSubject]}><Text style={styles.paymentHeaderText}>Konu</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colCap]}><Text style={styles.paymentHeaderText}>K/A/{'\n'}YEKA</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colInvoice]}><Text style={styles.paymentHeaderText}>Fatura{'\n'}Tutarı{'\n'}(TL)</Text></View>
            <View style={[styles.paymentHeaderCell, styles.colPayable, { borderRightWidth: 0 }]}><Text style={styles.paymentHeaderText}>Ödenecek{'\n'}Tutar (TL)</Text></View>
          </View>
          {items.map((it, idx) => (
            <View key={it.id || idx} style={styles.paymentRow} wrap={false}>
              <View style={[styles.paymentCell, styles.colIdx]}><Text style={styles.paymentText}>{idx + 1}</Text></View>
              <View style={[styles.paymentCell, styles.colDate]}><Text style={styles.paymentText}>{format(new Date(it.item_date), 'dd.MM.yyyy')}</Text></View>
              <View style={[styles.paymentCell, styles.colCompany]}><Text style={styles.paymentText}>{it.company_name}</Text></View>
              <View style={[styles.paymentCell, styles.colPayee]}><Text style={styles.paymentText}>{it.payee_name}</Text></View>
              <View style={[styles.paymentCell, styles.colSubject]}><Text style={styles.paymentText}>{it.item_subject}</Text></View>
              <View style={[styles.paymentCell, styles.colCap, { alignItems: 'center' }]}><Text style={styles.paymentText}>{capacityShortLabel[it.capacity_type] || it.capacity_type}</Text></View>
              <View style={[styles.paymentCell, styles.colInvoice, { alignItems: 'flex-end' }]}><Text style={styles.paymentText}>{formatAmount(Number(it.invoice_amount))}</Text></View>
              <View style={[styles.paymentCellLast, styles.colPayable, { alignItems: 'flex-end' }]}><Text style={styles.paymentText}>{formatAmount(Number(it.payable_amount))}</Text></View>
            </View>
          ))}
          {/* Toplam satırı (sadece Ödenecek Tutar sütununda) */}
          <View style={styles.paymentTotalRow} wrap={false}>
            <View style={[styles.paymentCell, { width: '88%', borderRightWidth: 1, alignItems: 'flex-end' }]}><Text style={styles.paymentTotalText}></Text></View>
            <View style={[styles.paymentTotalCell, styles.colPayable]}><Text style={styles.paymentTotalText}>{formatAmount(totalPayable)}</Text></View>
          </View>
        </View>

        {/* Statik bilgi notu */}
        <Text style={styles.staticInfoNote}>Fatura onay süresini geçen fatura YOKTUR</Text>

        {/* Değerlendirme satırları (7 boolean) */}
        <View style={styles.evalBlock}>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>DEMİRBAŞ KAYDI</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: VAR</Text>
              <CheckBox checked={accountingRequest.demirbas_registered === true} />
              <Text style={styles.evalItemText}>/ YOK</Text>
              <CheckBox checked={accountingRequest.demirbas_registered === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>İRSALİYE</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: VAR</Text>
              <CheckBox checked={accountingRequest.has_dispatch_note === true} />
              <Text style={styles.evalItemText}>/ YOK</Text>
              <CheckBox checked={accountingRequest.has_dispatch_note === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>TESLİM ALAN/EDEN BİLGİSİ</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: VAR</Text>
              <CheckBox checked={accountingRequest.has_delivery_info === true} />
              <Text style={styles.evalItemText}>/ YOK</Text>
              <CheckBox checked={accountingRequest.has_delivery_info === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>FATURA KAYDI – İCMAL</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: VAR</Text>
              <CheckBox checked={accountingRequest.has_invoice_record === true} />
              <Text style={styles.evalItemText}>/ YOK</Text>
              <CheckBox checked={accountingRequest.has_invoice_record === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>MUHASEBE PROGRAMINA GİRİŞ</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: YAPILDI</Text>
              <CheckBox checked={accountingRequest.has_accounting_prog_entry === true} />
              <Text style={styles.evalItemText}>/ YAPILMADI</Text>
              <CheckBox checked={accountingRequest.has_accounting_prog_entry === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>ARVENTO KAYDI</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: VAR</Text>
              <CheckBox checked={accountingRequest.has_arvento_record === true} />
              <Text style={styles.evalItemText}>/ YOK</Text>
              <CheckBox checked={accountingRequest.has_arvento_record === false} />
            </View>
          </View>
          <View style={styles.evalRow}>
            <Text style={styles.evalLabel}>KREDİDEN Mİ ÖDENİYOR?</Text>
            <View style={styles.evalValue}>
              <Text style={styles.evalItemText}>: EVET</Text>
              <CheckBox checked={accountingRequest.paid_from_credit === true} />
              <Text style={styles.evalItemText}>/ HAYIR</Text>
              <CheckBox checked={accountingRequest.paid_from_credit === false} />
            </View>
          </View>
        </View>

        {/* İLGİLİLER* — dinamik onaycılar */}
        <View style={styles.ilgilerSection}>
          <Text style={styles.ilgilerHeader}>İLGİLİLER*</Text>
          <Text style={styles.ilgilerSubNote}>(İşin yapıldığına/Malın teslimine ilişkin yazılı belge/Onay)</Text>
          {dynamicApprovals.length > 0 ? (
            <View style={styles.ilgilerGrid}>
              {dynamicApprovals.map((a, idx) => (
                <View key={a.id || idx} style={styles.ilgilerCell}>
                  {renderSignature(a.approver?.id)}
                  <Text style={styles.ilgilerName}>
                    {a.approver?.first_name} {a.approver?.last_name}
                  </Text>
                  {a.comment ? <Text style={styles.ilgilerNote}>{a.comment}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Muhasebe Müdürü (sağa yaslı) */}
        {muhasebeMuduru ? (
          <View style={styles.staticApproverRight} wrap={false}>
            <Text style={styles.staticTitleRight}>Onaylı dayanak belge kontrol edilmiştir.</Text>
            <Text style={styles.staticSubtitleRight}>
              {muhasebeMuduru.workflow_step?.static_position?.title || muhasebeMuduru.workflow_step?.name || 'İlgili Birim Yetkilisi / Müdürü'}
            </Text>
            {renderSignature(muhasebeMuduru.approver?.id)}
            <Text style={styles.staticNameRight}>
              {muhasebeMuduru.approver?.first_name} {muhasebeMuduru.approver?.last_name}
            </Text>
            {muhasebeMuduru.comment ? (
              <Text style={styles.staticCommentRight}>{muhasebeMuduru.comment}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Genel Müdür (sola yaslı, dinamik imza) */}
        {genelMudur && genelMudur !== muhasebeMuduru ? (
          <View style={styles.genelMudurBlock} wrap={false}>
            {renderSignature(genelMudur.approver?.id)}
            <Text style={styles.genelMudurName}>
              {genelMudur.approver?.first_name} {genelMudur.approver?.last_name}
            </Text>
            {genelMudur.comment ? (
              <Text style={styles.genelMudurComment}>{genelMudur.comment}</Text>
            ) : null}
          </View>
        ) : null}

        {/* ONAY — şirket kurucusu, sisteme giriş yapmıyor, fiziksel olarak imzalanacak */}
        <View style={styles.onayCenter} wrap={false}>
          <Text style={styles.onayHeader}>ONAY</Text>
          <Text style={styles.onayName}>{FOUNDER_NAME}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerTitle}>RT ENERJİ TURİZM SANAYİ VE TİCARET ANONİM ŞİRKETİ</Text>
          <Text style={styles.footerText}>Kemerağzı Mahallesi, Yaşar Sobutay Bulvarı, No:70, Aksu - Antalya</Text>
          <Text style={styles.footerText}>
            Antalya Kurumlar V.D.: 735 126 22 01 - Mersis No: 0-7351-2622-0100001 - Tic. Sic. No: 101091
          </Text>
          <Text style={styles.footerText}>
            Tlf. Merkez (Antalya): +90 (535) 456 26 07 - Ankara Şube: +90 (535) 456 25 98
          </Text>
          <Text style={styles.footerText}>
            Faks: +90 (242) 999 2605 / E-Posta: info@rtenerji.com / KEP Adresi: rtenerji@hs01.kep.tr
          </Text>
          <Text style={styles.footerText}>www.rtenerji.com</Text>
        </View>
      </Page>
    </Document>
  );
};

