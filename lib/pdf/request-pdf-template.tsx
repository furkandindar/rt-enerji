import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

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

// PDF için stil tanımlamaları
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Roboto',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #333',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 5,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    color: '#333',
    borderBottom: '1 solid #ddd',
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    width: '35%',
    fontSize: 10,
    color: '#666',
    fontWeight: 500,
  },
  value: {
    width: '65%',
    fontSize: 10,
    color: '#1a1a1a',
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: 8,
    fontWeight: 700,
    fontSize: 9,
    borderBottom: '1 solid #ddd',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    fontSize: 9,
    borderBottom: '1 solid #eee',
  },
  tableCol: {
    flex: 1,
  },
  badge: {
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    textAlign: 'center',
  },
  badgeApproved: {
    backgroundColor: '#22c55e',
    color: '#fff',
  },
  badgeRejected: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  badgePending: {
    backgroundColor: '#eab308',
    color: '#fff',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
    borderTop: '1 solid #ddd',
    paddingTop: 10,
  },
  signatureRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  signaturePosition: {
    width: '35%',
    fontSize: 10,
    color: '#333',
    fontWeight: 500,
  },
  signatureName: {
    width: '45%',
    fontSize: 10,
    color: '#1a1a1a',
  },
  signatureStatus: {
    width: '20%',
    fontSize: 9,
    color: '#22c55e',
    fontWeight: 500,
    textAlign: 'right',
  },
  signatureImage: {
    width: 80,
    height: 40,
    objectFit: 'contain',
  },
});

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: 'Yıllık İzin',
  SHORT_LEAVE: 'Kısa Süreli İzin',
};

interface RequestPDFTemplateProps {
  request: any;
  requester: any;
  leaveRequest: any;
  approvals: any[];
  workflowName: string;
  signatures?: Record<string, string>; // employeeId -> base64 image data
}

export const RequestPDFTemplate: React.FC<RequestPDFTemplateProps> = ({
  request,
  requester,
  leaveRequest,
  approvals,
  signatures = {},
  workflowName,
}) => {
  const getRequesterPosition = () => {
    if (!requester?.employee_positions) return '-';
    const primaryPosition = requester.employee_positions.find(
      (ep: any) => ep.is_primary && !ep.end_date
    );
    return primaryPosition?.position?.title || '-';
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Talep Onay Belgesi</Text>
          <Text style={styles.subtitle}>RT Enerji - {workflowName}</Text>
        </View>

        {/* Talep Bilgileri */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Talep Bilgileri</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Talep No:</Text>
            <Text style={styles.value}>{request.id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Durum:</Text>
            <Text style={styles.value}>{request.status === 'APPROVED' ? 'Onaylandı' : request.status}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Oluşturulma Tarihi:</Text>
            <Text style={styles.value}>
              {format(new Date(request.created_at), 'd MMMM yyyy HH:mm', { locale: tr })}
            </Text>
          </View>
          {request.completed_at && (
            <View style={styles.row}>
              <Text style={styles.label}>Onaylanma Tarihi:</Text>
              <Text style={styles.value}>
                {format(new Date(request.completed_at), 'd MMMM yyyy HH:mm', { locale: tr })}
              </Text>
            </View>
          )}
        </View>

        {/* Talep Sahibi Bilgileri */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Talep Sahibi</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Ad Soyad:</Text>
            <Text style={styles.value}>
              {requester.first_name} {requester.last_name}
            </Text>
          </View>
          {/* <View style={styles.row}>
            <Text style={styles.label}>Sicil No:</Text>
            <Text style={styles.value}>{requester.employee_no}</Text>
          </View> */}
          <View style={styles.row}>
            <Text style={styles.label}>Ünvan:</Text>
            <Text style={styles.value}>{getRequesterPosition()}</Text>
          </View>
        </View>

        {/* İzin Detayları */}
        {leaveRequest && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İzin Detayları</Text>
            <View style={styles.row}>
              <Text style={styles.label}>İzin Türü:</Text>
              <Text style={styles.value}>
                {leaveTypeLabels[leaveRequest.leave_type] || leaveRequest.leave_type}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Başlangıç:</Text>
              <Text style={styles.value}>
                {format(new Date(leaveRequest.start_datetime), 'd MMMM yyyy HH:mm', { locale: tr })}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Bitiş:</Text>
              <Text style={styles.value}>
                {format(new Date(leaveRequest.end_datetime), 'd MMMM yyyy HH:mm', { locale: tr })}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Toplam Gün:</Text>
              <Text style={styles.value}>{leaveRequest.total_days} gün</Text>
            </View>
            {leaveRequest.reason && (
              <View style={styles.row}>
                <Text style={styles.label}>Neden:</Text>
                <Text style={styles.value}>{leaveRequest.reason}</Text>
              </View>
            )}
          </View>
        )}

        {/* İmzalar */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>İmzalar</Text>

          {/* Talep Eden */}
          <View style={styles.signatureRow}>
            <Text style={styles.signaturePosition}>Talep Eden:</Text>
            <Text style={styles.signatureName}>
              {requester.first_name} {requester.last_name}
            </Text>
            <View style={{ width: '20%', alignItems: 'flex-end' }}>
              {signatures[requester.id] ? (
                <Image src={signatures[requester.id]} style={styles.signatureImage} />
              ) : (
                <Text style={styles.signatureStatus}>İmzalandı</Text>
              )}
            </View>
          </View>

          {/* Onaylayanlar - step_order > 1 olanlar (ilk adım talep edenin kendisi) */}
          {approvals
            .filter((a) => a.workflow_step.step_order > 1)
            .sort((a, b) => a.workflow_step.step_order - b.workflow_step.step_order)
            .map((approval, index) => {
              // Pozisyon adını belirle
              const positionTitle = approval.workflow_step.static_position
                ? approval.workflow_step.static_position.title
                : 'Talep Eden Amiri';

              return (
                <View key={index} style={styles.signatureRow}>
                  <Text style={styles.signaturePosition}>{positionTitle}:</Text>
                  <Text style={styles.signatureName}>
                    {approval.approver.first_name} {approval.approver.last_name}
                  </Text>
                  <View style={{ width: '20%', alignItems: 'flex-end' }}>
                    {signatures[approval.approver.id] ? (
                      <Image src={signatures[approval.approver.id]} style={styles.signatureImage} />
                    ) : (
                      <Text style={styles.signatureStatus}>İmzalandı</Text>
                    )}
                  </View>
                </View>
              );
            })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Bu belge {format(new Date(), 'd MMMM yyyy HH:mm', { locale: tr })} tarihinde otomatik olarak oluşturulmuştur.
          </Text>
          <Text>RT Enerji - İnsan Kaynakları Yönetim Sistemi</Text>
        </View>
      </Page>
    </Document>
  );
};

