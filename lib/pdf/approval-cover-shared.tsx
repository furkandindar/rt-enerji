import React from 'react';
import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import path from 'path';

// Finans ve Muhasebe onay kapaklarının ortak üst bloğu (header, Konu/Sayı/Tarih,
// değerlendirme cevapları). İki şablonun görsel olarak ayrışmaması için tek yerden
// beslenir. Font kaydı (Roboto) şablonların kendisinde yapılır; buradaki bileşenler
// Page'den fontFamily'yi miras alır.

const colors = {
  black: '#000000',
  grey: '#666666',
};

const LOGO_WIDTH = 100;

// Footer sayfanın altına absolute konumlanır (bottom 18 + ~50pt yükseklik). İçeriğin
// footer'a binmemesi için Page.paddingBottom EN AZ bu değer olmalı.
export const FOOTER_RESERVED_BOTTOM = 76;

const getLogoPath = () => path.join(process.cwd(), 'public', 'logo.png');

const styles = StyleSheet.create({
  // Header: logo solda, süreç adı ortada, sağda logo genişliğinde boşluk (gerçek ortalama için)
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  headerLogo: { width: LOGO_WIDTH, height: 34, objectFit: 'contain', objectPositionX: 0 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 0.5 },
  headerSpacer: { width: LOGO_WIDTH },
  headerLine: { borderBottomWidth: 1.5, borderColor: colors.black, marginBottom: 10 },

  // Sayı (sol) / Tarih (sağ); altında Konu
  titleMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  titleRow: { flexDirection: 'row', marginBottom: 2 },
  titleLabel: { fontSize: 10, fontWeight: 700 },
  titleValue: { fontSize: 10 },

  // Değerlendirme: sadece verilen cevap yazılır; satır başına 3 kalem
  evalBlock: { marginTop: 12 },
  evalRow: { flexDirection: 'row', marginBottom: 5 },
  evalItem: { width: '33.33%', paddingRight: 6 },
  evalItemFill: { flex: 1, paddingRight: 6 },
  evalText: { fontSize: 9 },
  evalLabel: { fontWeight: 700 },
  evalNote: { fontSize: 7, color: colors.grey, marginTop: 1 },

  // Footer (şirket künyesi) — her sayfada sabit
  footer: { position: 'absolute', bottom: 18, left: 30, right: 30, borderTopWidth: 1, borderColor: colors.black, paddingTop: 4, alignItems: 'center' },
  footerTitle: { fontSize: 7, fontWeight: 700 },
  footerText: { fontSize: 6, color: colors.grey, textAlign: 'center' },
});

export const CoverHeader: React.FC<{ title: string }> = ({ title }) => (
  <>
    <View style={styles.headerRow}>
      <Image src={getLogoPath()} style={styles.headerLogo} />
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
    <View style={styles.headerLine} />
  </>
);

interface CoverTitleBlockProps {
  subject: string | null;
  documentNo: string | null;
  requestDate: string;
}

export const CoverTitleBlock: React.FC<CoverTitleBlockProps> = ({ subject, documentNo, requestDate }) => (
  <>
    <View style={styles.titleMetaRow}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.titleLabel}>Sayı: </Text>
        <Text style={styles.titleValue}>{documentNo}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Text style={styles.titleLabel}>Tarih: </Text>
        <Text style={styles.titleValue}>{format(new Date(requestDate), 'dd.MM.yyyy')}</Text>
      </View>
    </View>
    <View style={styles.titleRow}>
      <Text style={styles.titleLabel}>Konu: </Text>
      <Text style={styles.titleValue}>{subject}</Text>
    </View>
  </>
);

export interface CoverEvalItem {
  label: string;
  /** Verilen cevap; null/undefined ise "-" basılır */
  value: string | null | undefined;
  /** Etiketin altına küçük gri not (ör. "(Taşeron ise)") */
  note?: string;
}

const EVAL_PER_ROW = 3;

export const CoverEvalGrid: React.FC<{ items: CoverEvalItem[] }> = ({ items }) => {
  const rows: CoverEvalItem[][] = [];
  for (let i = 0; i < items.length; i += EVAL_PER_ROW) rows.push(items.slice(i, i + EVAL_PER_ROW));
  return (
    <View style={styles.evalBlock}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.evalRow}>
          {row.map((it, ci) => (
            // Eksik satırın son kalemi kalan genişliğe yayılır (uzun cevaplar sarmasın)
            <View key={it.label} style={ci === row.length - 1 && row.length < EVAL_PER_ROW ? styles.evalItemFill : styles.evalItem}>
              <Text style={styles.evalText}>
                <Text style={styles.evalLabel}>{it.label}</Text>
                {`: ${it.value ?? '-'}`}
              </Text>
              {it.note ? <Text style={styles.evalNote}>{it.note}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

/** true/false/null → etiket eşlemesi (ör. yesNo(v, 'VAR', 'YOK')) */
export const yesNo = (v: boolean | null | undefined, yes: string, no: string): string | null =>
  v === true ? yes : v === false ? no : null;

/** Şirket künyesi footer'ı. Page style'ında paddingBottom >= FOOTER_RESERVED_BOTTOM olmalı. */
export const CoverFooter: React.FC = () => (
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
);

/**
 * Tablo hücreleri için kırılabilir metin. react-pdf boşluksuz uzun tokenları
 * (ör. "MAD.İNŞ.PET.TUR.SAN.TİC.LTD.ŞTİ") kelime içinde kıramaz ve hücre dışına
 * taşırır. 12 karakterden uzun tokenlarda, arkasından HARF gelen "." ve "/"
 * sonrasına boşluk ekleyerek doğal kırılma noktası verir. Kısa kısaltmalar
 * ("A.Ş.", "LTD.ŞTİ.") ve rakam dizileri (tarih "01/08/2026", poliçe no) olduğu gibi kalır.
 */
const SEPARATOR_BEFORE_LETTER = /([./])(?=[A-Za-zÇĞİÖŞÜçğıöşü])/g;

export const breakLongTokens = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .split(/(\s+)/)
    .map((tok) => (tok.length > 12 ? tok.replace(SEPARATOR_BEFORE_LETTER, '$1 ') : tok))
    .join('');
};
