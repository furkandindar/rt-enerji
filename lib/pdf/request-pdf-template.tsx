import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { SignatureFont } from '@/lib/signature/types';
import path from 'path';

// Logo path - Server-side render için mutlak yol gerekli
const getLogoPath = () => {
  // Server-side'da process.cwd() kullanarak mutlak yol oluştur
  return path.join(process.cwd(), 'public', 'logo.png');
};

// Türkçe karakterleri destekleyen font kaydet
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf',
      fontWeight: 300,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
      fontWeight: 500,
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 700,
    },
  ],
});

// İmza fontlarını kaydet
Font.register({
  family: 'Ballet',
  src: 'https://fonts.gstatic.com/s/ballet/v27/QGYyz_MYZA-HM4NjuGOVnUEXme1I4Xi3C4G-EiAou6Y.ttf',
});

Font.register({
  family: 'Great Vibes',
  src: 'https://fonts.gstatic.com/s/greatvibes/v18/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf',
});

Font.register({
  family: 'Sacramento',
  src: 'https://fonts.gstatic.com/s/sacramento/v15/buEzpo6gcdjy0EiZMBUG0CoV_NxLeiw.ttf',
});

// Font mapping for PDF
const signatureFontMap: Record<SignatureFont, string> = {
  'Ballet': 'Ballet',
  'Great Vibes': 'Great Vibes',
  'Sacramento': 'Sacramento',
};

// Renkler - Screenshot'a uygun
const colors = {
  orange: '#F97316',
  orangeLight: '#FFECD2',
  black: '#000000',
  white: '#FFFFFF',
};

// PDF için stil tanımlamaları - Landscape format (Screenshot'a uygun)
const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8,
    fontFamily: 'Roboto',
    backgroundColor: colors.white,
  },
  // Header - Logo | Title | Logo
  headerContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.black,
  },
  logoCell: {
    width: 70,
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 45,
    height: 45,
  },
  titleCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  titleText: {
    fontSize: 14,
    fontWeight: 700,
  },
  logoRightCell: {
    width: 70,
    padding: 8,
    borderLeftWidth: 1,
    borderColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Section Header (PERSONEL BİLGİLERİ, ONAY)
  sectionHeader: {
    backgroundColor: colors.orange,
    padding: 4,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.black,
  },
  sectionHeaderText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: 700,
    textAlign: 'center',
  },
  // Main content area - two columns
  mainContent: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.black,
  },
  leftColumn: {
    width: '55%',
    borderRightWidth: 1,
    borderColor: colors.black,
  },
  rightColumn: {
    width: '45%',
  },
  // Table row for left column
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.black,
    minHeight: 20,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 20,
  },
  labelCell: {
    width: '40%',
    backgroundColor: colors.orangeLight,
    padding: 4,
    borderRightWidth: 1,
    borderColor: colors.black,
    justifyContent: 'center',
  },
  valueCell: {
    width: '60%',
    padding: 4,
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 8,
    fontWeight: 500,
  },
  valueText: {
    fontSize: 8,
  },
  // Right column - top rows
  rightTopRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.black,
    minHeight: 20,
  },
  rightLabelCell: {
    width: '50%',
    backgroundColor: colors.orangeLight,
    padding: 4,
    borderRightWidth: 1,
    borderColor: colors.black,
    justifyContent: 'center',
  },
  rightValueCell: {
    width: '50%',
    padding: 4,
    justifyContent: 'center',
  },
  // Info box (sağ taraftaki sarı kutu)
  infoBox: {
    backgroundColor: colors.orangeLight,
    padding: 6,
    flex: 1,
  },
  infoText: {
    fontSize: 6,
    lineHeight: 1.4,
  },
  infoBold: {
    fontSize: 6,
    fontWeight: 700,
    marginTop: 4,
  },
  // ONAY Section
  onayHeader: {
    backgroundColor: colors.orange,
    padding: 4,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.black,
  },
  onayHeaderText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: 700,
    textAlign: 'center',
  },
  onayContent: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.black,
  },
  onayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: colors.black,
  },
  onayColumnLast: {
    flex: 1,
  },
  onayTitleRow: {
    backgroundColor: colors.orangeLight,
    padding: 4,
    borderBottomWidth: 1,
    borderColor: colors.black,
    minHeight: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onayTitleText: {
    fontSize: 7,
    fontWeight: 700,
    textAlign: 'center',
  },
  onaySignatureRow: {
    padding: 4,
    borderBottomWidth: 1,
    borderColor: colors.white,
    minHeight: 35,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  onayNameText: {
    fontSize: 7,
    textAlign: 'center',
    marginBottom: 2,
  },
  onayNoteRow: {
    padding: 4,
    minHeight: 45,
  },
  onayNoteText: {
    fontSize: 5.5,
    color: '#666',
    lineHeight: 1.3,
  },
  // Footer
  footer: {
    marginTop: 10,
    fontSize: 6,
    color: '#666',
  },
  footerText: {
    marginBottom: 2,
  },
  signatureText: {
    fontSize: 14,
    color: '#1a365d',
  },
  signatureStatus: {
    fontSize: 7,
    color: '#666',
  },
});

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: 'Yıllık İzin',
  SHORT_LEAVE: 'Kısa Süreli İzin',
};

// Font-based signature info
interface SignatureInfo {
  text: string;
  font: SignatureFont;
}

interface RequestPDFTemplateProps {
  request: any;
  requester: any;
  leaveRequest: any;
  approvals: any[];
  workflowName?: string;
  signatures?: Record<string, SignatureInfo>; // employeeId -> signature info
}

export const RequestPDFTemplate: React.FC<RequestPDFTemplateProps> = ({
  request,
  requester,
  leaveRequest,
  approvals,
  signatures = {},
}) => {
  // İmza render helper
  const renderSignature = (employeeId: string) => {
    const sig = signatures[employeeId];
    if (sig) {
      return (
        <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>
          {sig.text}
        </Text>
      );
    }
    return <Text style={styles.signatureStatus}>İmza</Text>;
  };

  const getRequesterPosition = () => {
    if (!requester?.employee_positions) return '-';
    const primaryPosition = requester.employee_positions.find(
      (ep: any) => ep.is_primary && !ep.end_date
    );
    return primaryPosition?.position?.title || '-';
  };

  // Kalan izin günü (Personel Müdürlüğü tarafından giriliyor)
  const kalanIzinGunu = leaveRequest?.remaining_days !== null && leaveRequest?.remaining_days !== undefined
    ? `${leaveRequest.remaining_days} gün`
    : '-';

  // HR notu (Personel Müdürlüğü tarafından giriliyor - opsiyonel)
  const hrNote = leaveRequest?.hr_note || null;

  // Onay sütunları - Screenshot'taki gibi 5 sütun
  const getApprovalColumns = () => {
    const columns = [
      { title: 'Talep Eden', name: `${requester.first_name} ${requester.last_name}`, employeeId: requester.id, note: '' },
    ];

    // Onaylayanları sıraya göre ekle
    const sortedApprovals = approvals
      .filter((a) => a.workflow_step.step_order > 1)
      .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order);

    sortedApprovals.forEach((approval) => {
      const positionTitle = approval.workflow_step.static_position
        ? approval.workflow_step.static_position.title
        : 'Talep Eden Amiri';
      columns.push({
        title: positionTitle,
        name: `${approval.approver.first_name} ${approval.approver.last_name}`,
        employeeId: approval.approver.id,
        note: approval.comment || '',
      });
    });

    // İnsan Kaynakları için özel not
    const hrIndex = columns.findIndex(c => c.title.toLowerCase().includes('insan kaynakları') || c.title.toLowerCase().includes('personel'));
    if (hrIndex > -1) {
      columns[hrIndex].note = 'Fazla Mesai oluşup oluşmadığı yazılmalıdır.\nOluşuyorsa izin boyunca oluşacak toplam tutar yazılmalıdır.';
    }

    return columns;
  };

  const approvalColumns = getApprovalColumns();

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header - Logo | Title | Logo */}
        <View style={styles.headerContainer}>
          <View style={styles.logoCell}>
            <Image src={getLogoPath()} style={styles.logoImage} />
          </View>
          <View style={styles.titleCell}>
            <Text style={styles.titleText}>YILLIK İZİN TALEP FORMU</Text>
          </View>
          <View style={styles.logoRightCell}>
            <Image src={getLogoPath()} style={styles.logoImage} />
          </View>
        </View>

        {/* PERSONEL BİLGİLERİ Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>PERSONEL BİLGİLERİ</Text>
        </View>

        {/* Main Content - Two Columns */}
        <View style={styles.mainContent}>
          {/* Left Column - Form Fields */}
          <View style={styles.leftColumn}>
            {/* Adı / Soyadı */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>Adı / Soyadı</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{requester.first_name} {requester.last_name}</Text></View>
            </View>
            {/* Şirket */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>Şirket</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>RT ENERJİ TURİZM SAN. TİC. A.Ş.</Text></View>
            </View>
            {/* Görev Unvanı */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>Görev Unvanı</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{getRequesterPosition()}</Text></View>
            </View>
            {/* İzinde Bulunacağı Adres */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>İzinde Bulunacağı Adres</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{leaveRequest?.address_during_leave || '-'}</Text></View>
            </View>
            {/* İzne Çıkış Tarihi/Saati */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>İzne Çıkış Tarihi/Saati</Text></View>
              <View style={styles.valueCell}>
                <Text style={styles.valueText}>
                  {leaveRequest ? format(new Date(leaveRequest.start_datetime), 'dd/MM/yyyy HH:mm') : '-'}
                </Text>
              </View>
            </View>
            {/* İzinden Dönüş Tarihi/Saati */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>İzinden Dönüş Tarihi/Saati</Text></View>
              <View style={styles.valueCell}>
                <Text style={styles.valueText}>
                  {leaveRequest ? format(new Date(leaveRequest.end_datetime), 'dd/MM/yyyy HH:mm') : '-'}
                </Text>
              </View>
            </View>
            {/* İzin Gün Sayısı */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>İzin Gün Sayısı</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{leaveRequest?.total_days || '-'} gün</Text></View>
            </View>
            {/* Kalan İzin Günü */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}><Text style={styles.labelText}>Kalan İzin Günü</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{kalanIzinGunu}</Text></View>
            </View>
            {/* İzin Talep Nedeni */}
            <View style={hrNote ? styles.tableRow : styles.tableRowLast}>
              <View style={styles.labelCell}><Text style={styles.labelText}>İzin Talep Nedeni</Text></View>
              <View style={styles.valueCell}><Text style={styles.valueText}>{leaveRequest?.reason || '-'}</Text></View>
            </View>
            {/* İK Notu - Sadece varsa göster */}
            {hrNote && (
              <View style={styles.tableRowLast}>
                <View style={styles.labelCell}><Text style={styles.labelText}>İK Notu</Text></View>
                <View style={styles.valueCell}><Text style={styles.valueText}>{hrNote}</Text></View>
              </View>
            )}
          </View>

          {/* Right Column */}
          <View style={styles.rightColumn}>
            {/* İzin Türü */}
            <View style={styles.rightTopRow}>
              <View style={styles.rightLabelCell}><Text style={styles.labelText}>İzin Türü:</Text></View>
              <View style={styles.rightValueCell}>
                <Text style={styles.valueText}>{leaveTypeLabels[leaveRequest?.leave_type] || leaveRequest?.leave_type || 'Yıllık İzin'}</Text>
              </View>
            </View>
            {/* İzin Talep Tarihi */}
            <View style={styles.rightTopRow}>
              <View style={styles.rightLabelCell}><Text style={styles.labelText}>İzin Talep Tarihi:</Text></View>
              <View style={styles.rightValueCell}>
                <Text style={styles.valueText}>
                  {format(new Date(request.created_at), 'dd/MM/yyyy')}
                </Text>
              </View>
            </View>
            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Yıllık izinler en fazla dört parçaya bölünebilir. Önemli olmayan konularda bölünmüş yıllık izin kullanımı uygun değildir.
              </Text>
              <Text style={styles.infoText}>
                Bölünmüş yıllık izinler haftasonu, resmi tatil ve haftasonları ile birleştirilemez.
              </Text>
              <Text style={[styles.infoBold, { marginTop: 8 }]}>ASİSTAN – Bildirim</Text>
              <Text style={styles.infoText}>1-Talep Eden</Text>
              <Text style={styles.infoText}>2-İlgili Bölüm Müdürü</Text>
              <Text style={styles.infoText}>3-Personel Müdürlüğü</Text>
              <Text style={styles.infoText}>4-Muhasebe Müdürlüğü</Text>
              <Text style={[styles.infoText, { marginTop: 8 }]}>
                Tamamlanan form asistan tarafından taranarak İK - İK Onaylı Formlar adresine yüklenir.
              </Text>
            </View>
          </View>
        </View>

        {/* ONAY Section Header */}
        <View style={styles.onayHeader}>
          <Text style={styles.onayHeaderText}>ONAY</Text>
        </View>

        {/* ONAY Content - Workflow adımlarına göre dinamik sütunlar */}
        <View style={styles.onayContent}>
          {approvalColumns.map((col, index) => (
            <View key={index} style={index === approvalColumns.length - 1 ? styles.onayColumnLast : styles.onayColumn}>
              {/* Title Row */}
              <View style={styles.onayTitleRow}>
                <Text style={styles.onayTitleText}>{col.title}</Text>
              </View>
              {/* Signature Row - Ad Soyad + İmza */}
              <View style={styles.onaySignatureRow}>
                <Text style={styles.onayNameText}>{col.name}</Text>
                {renderSignature(col.employeeId)}
              </View>
              {/* Note Row - Yorum varsa göster */}
              {col.note ? (
                <View style={styles.onayNoteRow}>
                  <Text style={styles.onayNoteText}>{col.note}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {/* <Text style={styles.footerText}>Bildirim Yetkilisi:Yönetici Asistanı</Text>
          <Text style={styles.footerText}>Bildirilecek Kişiler:Çalışan/Amiri/Muhasebe/Personel Müdürlüğü/İK(SharePoint)</Text> */}
          {/* <Text style={styles.footerText}>Tüm Formlar SharePoint/İK/Formlar dosyasına kaydedilir.</Text> */}
        </View>
      </Page>
    </Document>
  );
};

