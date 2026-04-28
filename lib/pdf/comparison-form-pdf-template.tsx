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
  greyLight: '#E5E5E5',
  greyMid: '#CCCCCC',
  amberSub: '#F4D9B7',  // krem - alt başlıklar / form bantı
  amberDark: '#E5B98E', // koyu krem - ana başlık bantı
  emerald: '#D1FAE5',   // min — yeşil
  rose: '#FFE4E6',      // max — pembe
  navy: '#1a365d',
};

const CURRENCY_SYMBOL: Record<string, string> = { TRY: 'TL', USD: '$', EUR: '€' };

const moneyFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '-';
  return moneyFmt.format(Number(v));
};
const fmtQty = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : moneyFmt.format(n);
};

const styles = StyleSheet.create({
  page: { padding: 18, fontSize: 8, fontFamily: 'Roboto', backgroundColor: colors.white },

  // Tek dış tablo
  table: { borderWidth: 0.5, borderColor: colors.black },

  // Satır + hücre temelleri
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: colors.black },
  rowLast: { flexDirection: 'row' },
  cell: { padding: 3, borderRightWidth: 0.5, borderColor: colors.black, justifyContent: 'center' },
  cellLast: { padding: 3, justifyContent: 'center' },

  // Metin
  text: { fontSize: 8 },
  textBold: { fontSize: 8, fontWeight: 700 },
  textCenter: { fontSize: 8, textAlign: 'center' },
  textRight: { fontSize: 8, textAlign: 'right' },
  textBoldCenter: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
  textBoldRight: { fontSize: 8, fontWeight: 700, textAlign: 'right' },
  textTitleLg: { fontSize: 13, fontWeight: 700, textAlign: 'center' },
  textMeta: { fontSize: 7 },
  textMetaBold: { fontSize: 7, fontWeight: 700 },

  // Arka planlar
  bgHeader: { backgroundColor: colors.amberDark },
  bgSub: { backgroundColor: colors.amberSub },
  bgGrey: { backgroundColor: colors.greyLight },
  bgGreyMid: { backgroundColor: colors.greyMid },

  // Vurgular
  cellMin: { backgroundColor: colors.emerald },
  cellMax: { backgroundColor: colors.rose },

  // Logo
  logoCell: { padding: 3, borderRightWidth: 0.5, borderColor: colors.black, alignItems: 'flex-start', justifyContent: 'center' },
  logoImage: { width: 70, height: 26, objectFit: 'contain' },

  // FX kutusu (EUR/USD)
  fxCol: { flexDirection: 'column', borderRightWidth: 0.5, borderColor: colors.black },
  fxRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: colors.black, flex: 1 },
  fxRowLast: { flexDirection: 'row', flex: 1 },
  fxLabel: { width: 28, padding: 2, borderRightWidth: 0.5, borderColor: colors.black, fontSize: 8, fontWeight: 700, textAlign: 'center', alignSelf: 'stretch' },
  fxValue: { flex: 1, padding: 2, fontSize: 8, textAlign: 'right', alignSelf: 'stretch' },

  // Form info (sağ üst)
  formInfoCell: { padding: 3, justifyContent: 'center' },
  formInfoLine: { fontSize: 7, fontWeight: 700, marginBottom: 1 },

  // Talep info küçük etiket sütunu
  reqLabel: { padding: 3, borderRightWidth: 0.5, borderColor: colors.black, fontSize: 8, fontWeight: 700, justifyContent: 'center' },
  reqValue: { padding: 3, fontSize: 8, justifyContent: 'center' },

  // İmza
  signatureCell: { padding: 4, borderRightWidth: 0.5, borderColor: colors.black, alignItems: 'center', justifyContent: 'flex-start' },
  signatureCellLast: { padding: 4, alignItems: 'center', justifyContent: 'flex-start' },
  signatureRoleText: { fontSize: 8, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
  signatureNameText: { fontSize: 7, color: colors.grey, marginBottom: 4, textAlign: 'center' },
  signatureBox: { minHeight: 36, width: '100%', alignItems: 'center', justifyContent: 'center', borderTopWidth: 0.5, borderColor: colors.black, paddingTop: 4 },
  signatureText: { fontSize: 14, color: colors.navy },
  signaturePending: { fontSize: 7, color: colors.grey },
  signatureMeta: { fontSize: 6, color: colors.grey, marginTop: 2 },

  // Sayfa altı
  pageFooter: { position: 'absolute', bottom: 8, left: 18, right: 18, borderTopWidth: 0.5, borderColor: colors.black, paddingTop: 3, alignItems: 'center' },
  pageFooterText: { fontSize: 6, color: colors.grey },
});

interface SignatureInfo { text: string; font: SignatureFont; }

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ComparisonFormPDFTemplateProps {
  request: any;
  requester: any;
  mukayeseRequest: any; // includes items[], suppliers[], prices[] (joined)
  approvals: any[];
  signatures?: Record<string, SignatureInfo>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ComparisonFormPDFTemplate: React.FC<ComparisonFormPDFTemplateProps> = (props) => {
  return <ComparisonFormDocument {...props} />;
};

export default ComparisonFormPDFTemplate;

// ============================================================================
// Helpers
// ============================================================================

const UNIT_LABEL: Record<string, string> = { ADET: 'Adet', SET: 'Set', GUN: 'Gün' };

interface ItemRow {
  id: string;
  row_order: number;
  row_type: 'ITEM' | 'SUBTOTAL';
  description: string | null;
  quantity: number | null;
  unit: string | null;
}

interface SupplierCol {
  id: string;
  column_order: number;
  company_name: string;
  payment_terms: string | null;
  technical_description: string | null;
  delivery_time: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

interface PriceCell {
  mukayese_item_id: string;
  mukayese_supplier_id: string;
  unit_price: number;
}

/**
 * Türetilmiş değerleri hesaplar — UI'daki MatrixEditor'la aynı mantık:
 * - SUBTOTAL satırı için bloktaki ITEM toplamları
 * - Her ITEM satırı için min/max birim fiyat
 * - Her firma için kolon toplamı (KDV hariç & dahil)
 */
function deriveMatrixTotals(
  items: ItemRow[],
  suppliers: SupplierCol[],
  priceMap: Record<string, number>,
  kdvRate: number,
) {
  const blockSums: Record<string, number> = {};
  for (const s of suppliers) blockSums[s.id] = 0;

  const subtotalValues: Record<string, Record<string, number>> = {};
  const minMaxByItem: Record<string, { min: number; max: number }> = {};
  const columnTotalsExKdv: Record<string, number> = {};
  for (const s of suppliers) columnTotalsExKdv[s.id] = 0;

  for (const it of items) {
    if (it.row_type === 'ITEM') {
      const qty = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity) || 0;
      const filledUnitPrices: number[] = [];
      for (const s of suppliers) {
        const up = priceMap[`${it.id}:${s.id}`];
        if (typeof up === 'number') {
          const lineTotal = qty * up;
          blockSums[s.id] += lineTotal;
          columnTotalsExKdv[s.id] += lineTotal;
          filledUnitPrices.push(up);
        }
      }
      if (filledUnitPrices.length >= 2) {
        minMaxByItem[it.id] = { min: Math.min(...filledUnitPrices), max: Math.max(...filledUnitPrices) };
      }
    } else {
      const row: Record<string, number> = {};
      for (const s of suppliers) {
        row[s.id] = blockSums[s.id];
        blockSums[s.id] = 0;
      }
      subtotalValues[it.id] = row;
    }
  }

  const kdvMul = 1 + (Number.isFinite(kdvRate) ? kdvRate : 0) / 100;
  const columnTotalsIncKdv: Record<string, number> = {};
  for (const s of suppliers) columnTotalsIncKdv[s.id] = columnTotalsExKdv[s.id] * kdvMul;

  return { subtotalValues, minMaxByItem, columnTotalsExKdv, columnTotalsIncKdv };
}

const renderSig = (
  signatures: Record<string, SignatureInfo> | undefined,
  employeeId: string | null | undefined,
) => {
  if (!employeeId) return <Text style={styles.signaturePending}>İmza</Text>;
  const sig = signatures?.[employeeId];
  if (sig) {
    return (
      <Text style={[styles.signatureText, { fontFamily: signatureFontMap[sig.font] }]}>{sig.text}</Text>
    );
  }
  return <Text style={styles.signaturePending}>İmza</Text>;
};

// ============================================================================
// Document
// ============================================================================

const ComparisonFormDocument: React.FC<ComparisonFormPDFTemplateProps> = ({
  request,
  requester,
  mukayeseRequest,
  approvals,
  signatures = {},
}) => {
  const items: ItemRow[] = [...(mukayeseRequest.items || [])].sort(
    (a: ItemRow, b: ItemRow) => (a.row_order ?? 0) - (b.row_order ?? 0),
  );
  const suppliers: SupplierCol[] = [...(mukayeseRequest.suppliers || [])].sort(
    (a: SupplierCol, b: SupplierCol) => (a.column_order ?? 0) - (b.column_order ?? 0),
  );
  const priceRows: PriceCell[] = mukayeseRequest.prices || [];
  const priceMap: Record<string, number> = {};
  for (const p of priceRows) {
    priceMap[`${p.mukayese_item_id}:${p.mukayese_supplier_id}`] = Number(p.unit_price);
  }

  const kdvRate = Number(mukayeseRequest.kdv_rate) || 0;
  const currency = mukayeseRequest.form_currency || 'TRY';
  const symbol = CURRENCY_SYMBOL[currency] || currency;
  const totals = deriveMatrixTotals(items, suppliers, priceMap, kdvRate);

  // Sütun genişlikleri (A3 landscape iç alan ~1140pt)
  const PAGE_INNER = 1140;
  const wNr = 28;
  const wDesc = 200;
  const wQty = 50;
  const wUnit = 50;
  const wComment = 130;
  const fixedLeft = wNr + wDesc + wQty + wUnit;
  const N = Math.max(suppliers.length, 1);
  const supplierTotalW = Math.max(80, Math.floor((PAGE_INNER - fixedLeft - wComment) / N));
  const supplierUnitW = Math.floor(supplierTotalW / 2);
  const supplierFinalW = supplierTotalW - supplierUnitW;
  const widths = { wNr, wDesc, wQty, wUnit, supplierUnitW, supplierFinalW, wComment };
  const supplierAreaW = supplierTotalW * suppliers.length;
  const totalRowW = fixedLeft + supplierAreaW + wComment;

  let itemSeq = 0;

  return (
    <Document>
      <Page size="A3" orientation="landscape" style={styles.page} wrap>
        <View style={styles.table}>
          <TopHeaderBlock
            wLogo={wNr + wDesc}
            wFx={wQty + wUnit}
            suppliers={suppliers}
            supplierTotalW={supplierTotalW}
            supplierAreaW={supplierAreaW}
            wComment={wComment}
            mukayeseRequest={mukayeseRequest}
            request={request}
          />
          <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderColor: colors.black }}>
            <View style={{ flexDirection: 'column', width: fixedLeft + supplierAreaW }}>
              <ColumnHeaderRow widths={widths} suppliers={suppliers} symbol={symbol} />
              <DataRows
                items={items}
                suppliers={suppliers}
                priceMap={priceMap}
                totals={totals}
                widths={widths}
                incrementSeq={() => ++itemSeq}
              />
              <TotalRows
                suppliers={suppliers}
                totals={totals}
                kdvRate={kdvRate}
                fixedLeft={fixedLeft}
                supplierUnitW={supplierUnitW}
                supplierFinalW={supplierFinalW}
              />
              <SupplierFooterRows
                suppliers={suppliers}
                fixedLeft={fixedLeft}
                supplierTotalW={supplierTotalW}
              />
            </View>
            <View style={{ width: wComment, padding: 4 }}>
              <Text style={styles.text}>{mukayeseRequest.notes || ''}</Text>
            </View>
          </View>
          <RequestInfoSection
            mukayeseRequest={mukayeseRequest}
            requester={requester}
            request={request}
            totalRowW={totalRowW}
          />
          <SignatureSection
            approvals={approvals}
            signatures={signatures}
            totalRowW={totalRowW}
          />
        </View>

        <View style={styles.pageFooter} fixed>
          <Text style={styles.pageFooterText}>RT Enerji · Mukayese Formu</Text>
        </View>
      </Page>
    </Document>
  );
};

// ============================================================================
// TopHeaderBlock — logo + EUR/USD + FİRMA/KONU/ÜRÜN başlığı + Form info
// ============================================================================

interface TopHeaderProps {
  wLogo: number;
  wFx: number;
  suppliers: SupplierCol[];
  supplierTotalW: number;
  supplierAreaW: number;
  wComment: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  mukayeseRequest: any;
  request: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const TopHeaderBlock: React.FC<TopHeaderProps> = ({
  wLogo, wFx, suppliers, supplierTotalW, supplierAreaW, wComment, mukayeseRequest, request,
}) => {
  const formDate = mukayeseRequest.form_date
    ? format(new Date(mukayeseRequest.form_date), 'dd.MM.yyyy')
    : '-';
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.logoCell, { width: wLogo }]}>
          <Image src={getLogoPath()} style={styles.logoImage} />
        </View>
        <View style={[styles.fxCol, { width: wFx }]}>
          <View style={styles.fxRow}>
            <Text style={styles.fxLabel}>EUR</Text>
            <Text style={styles.fxValue}>
              {mukayeseRequest.fx_eur_try ? fmtMoney(Number(mukayeseRequest.fx_eur_try)) : ''}
            </Text>
          </View>
          <View style={styles.fxRow}>
            <Text style={styles.fxLabel}>USD</Text>
            <Text style={styles.fxValue}>
              {mukayeseRequest.fx_usd_try ? fmtMoney(Number(mukayeseRequest.fx_usd_try)) : ''}
            </Text>
          </View>
          <View style={styles.fxRowLast}>
            <Text style={styles.fxLabel}>€/$</Text>
            <Text style={styles.fxValue}>
              {mukayeseRequest.fx_eur_usd ? fmtMoney(Number(mukayeseRequest.fx_eur_usd)) : ''}
            </Text>
          </View>
        </View>
        <View style={[styles.cell, { width: supplierAreaW, alignItems: 'center' }]}>
          <Text style={styles.textTitleLg}>{mukayeseRequest.project_title || '-'}</Text>
        </View>
        <View style={[styles.formInfoCell, { width: wComment }]}>
          <Text style={styles.formInfoLine}>FORM DÜZENLENME TARİHİ: {formDate}</Text>
          <Text style={styles.formInfoLine}>DÜZENLEYEN: {mukayeseRequest.preparer_full_name || '-'}</Text>
          <Text style={styles.formInfoLine}>REF: {request?.request_no || '-'}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.cell, styles.bgSub, { width: wLogo }]}>
          <Text style={styles.text}> </Text>
        </View>
        <View style={[styles.cell, styles.bgSub, { width: wFx, alignItems: 'center' }]}>
          <Text style={styles.textBoldCenter}>TCMB DÖVİZ SATIŞ KURU</Text>
        </View>
        {suppliers.map((s, i) => (
          <View
            key={s.id}
            style={[styles.cell, styles.bgHeader, { width: supplierTotalW, alignItems: 'center' }]}
          >
            <Text style={styles.textBoldCenter}>{s.company_name || `FİRMA ${i + 1}`}</Text>
          </View>
        ))}
        <View style={[styles.cellLast, styles.bgSub, { width: wComment, alignItems: 'flex-start' }]}>
          <Text style={styles.textBoldCenter}>AÇIKLAMA VE YORUMLAR:</Text>
        </View>
      </View>
    </>
  );
};

// ============================================================================
// ColumnHeaderRow — Nr | Mal/Hizmet | Miktar | Birim | (BF, TF)*N | empty
// ============================================================================

interface Widths {
  wNr: number; wDesc: number; wQty: number; wUnit: number;
  supplierUnitW: number; supplierFinalW: number; wComment: number;
}

const ColumnHeaderRow: React.FC<{ widths: Widths; suppliers: SupplierCol[]; symbol: string }> = ({
  widths, suppliers, symbol,
}) => (
  <View style={styles.row}>
    <View style={[styles.cell, { width: widths.wNr }]}><Text style={styles.textBoldCenter}>Nr</Text></View>
    <View style={[styles.cell, { width: widths.wDesc }]}><Text style={styles.textBoldCenter}>Mal ve Hizmet Bilgileri</Text></View>
    <View style={[styles.cell, styles.bgHeader, { width: widths.wQty }]}><Text style={styles.textBoldCenter}>Miktar</Text></View>
    <View style={[styles.cell, styles.bgHeader, { width: widths.wUnit }]}><Text style={styles.textBoldCenter}>Birim</Text></View>
    {suppliers.map((s) => (
      <React.Fragment key={s.id}>
        <View style={[styles.cell, { width: widths.supplierUnitW }]}>
          <Text style={styles.textBoldCenter}>BİRİM FİYAT ({symbol})</Text>
        </View>
        <View style={[styles.cell, { width: widths.supplierFinalW }]}>
          <Text style={styles.textBoldCenter}>TOPLAM FİYAT</Text>
        </View>
      </React.Fragment>
    ))}
  </View>
);

// ============================================================================
// DataRows — ITEM ve SUBTOTAL satırları (her firma için BF + TF)
// ============================================================================

interface DataRowsProps {
  items: ItemRow[];
  suppliers: SupplierCol[];
  priceMap: Record<string, number>;
  totals: ReturnType<typeof deriveMatrixTotals>;
  widths: Widths;
  incrementSeq: () => number;
}

const DataRows: React.FC<DataRowsProps> = ({
  items, suppliers, priceMap, totals, widths, incrementSeq,
}) => (
  <>
    {items.map((it) => {
      const isSub = it.row_type === 'SUBTOTAL';
      const seq = !isSub ? incrementSeq() : null;
      const minMax = totals.minMaxByItem[it.id];
      const qty = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity) || 0;
      return (
        <View key={it.id} style={[styles.row, ...(isSub ? [styles.bgSub] : [])]} wrap={false}>
          <View style={[styles.cell, { width: widths.wNr }]}>
            <Text style={styles.textBoldCenter}>{isSub ? 'Σ' : seq}</Text>
          </View>
          <View style={[styles.cell, { width: widths.wDesc }]}>
            <Text style={isSub ? styles.textBold : styles.text}>
              {it.description || (isSub ? 'Ara Toplam' : '-')}
            </Text>
          </View>
          <View style={[styles.cell, { width: widths.wQty }]}>
            <Text style={styles.textRight}>{isSub ? '' : fmtQty(it.quantity)}</Text>
          </View>
          <View style={[styles.cell, { width: widths.wUnit }]}>
            <Text style={styles.textCenter}>
              {isSub ? '' : (UNIT_LABEL[it.unit || ''] || it.unit || '')}
            </Text>
          </View>
          {suppliers.map((s) => {
            if (isSub) {
              const sub = totals.subtotalValues[it.id]?.[s.id] ?? 0;
              return (
                <React.Fragment key={s.id}>
                  <View style={[styles.cell, { width: widths.supplierUnitW }]}>
                    <Text style={styles.text}> </Text>
                  </View>
                  <View style={[styles.cell, { width: widths.supplierFinalW }]}>
                    <Text style={styles.textBoldRight}>{fmtMoney(sub)}</Text>
                  </View>
                </React.Fragment>
              );
            }
            const up = priceMap[`${it.id}:${s.id}`];
            const lineTotal = typeof up === 'number' ? qty * up : null;
            let highlight: typeof styles.cellMin | null = null;
            if (minMax && typeof up === 'number' && minMax.min !== minMax.max) {
              if (up === minMax.min) highlight = styles.cellMin;
              else if (up === minMax.max) highlight = styles.cellMax;
            }
            const hl = highlight ? [highlight] : [];
            return (
              <React.Fragment key={s.id}>
                <View style={[styles.cell, { width: widths.supplierUnitW }, ...hl]}>
                  <Text style={styles.textRight}>
                    {typeof up === 'number' ? fmtMoney(up) : '-'}
                  </Text>
                </View>
                <View style={[styles.cell, { width: widths.supplierFinalW }, ...hl]}>
                  <Text style={styles.textRight}>
                    {lineTotal !== null ? fmtMoney(lineTotal) : '-'}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      );
    })}
  </>
);

// ============================================================================
// TotalRows — TOPLAM (KDV Hariç) ve TOPLAM (KDV Dahil)
// ============================================================================

interface TotalRowsProps {
  suppliers: SupplierCol[];
  totals: ReturnType<typeof deriveMatrixTotals>;
  kdvRate: number;
  fixedLeft: number;
  supplierUnitW: number;
  supplierFinalW: number;
}

const TotalRows: React.FC<TotalRowsProps> = ({
  suppliers, totals, kdvRate, fixedLeft, supplierUnitW, supplierFinalW,
}) => {
  if (suppliers.length === 0) return null;
  const renderRow = (
    label: string,
    getVal: (sid: string) => number,
    dark: boolean,
  ) => (
    <View style={[styles.row, dark ? styles.bgHeader : styles.bgSub]} wrap={false}>
      <View style={[styles.cell, { width: fixedLeft }]}>
        <Text style={styles.textBoldRight}>{label}</Text>
      </View>
      {suppliers.map((s) => (
        <React.Fragment key={s.id}>
          <View style={[styles.cell, { width: supplierUnitW }]}>
            <Text style={styles.text}> </Text>
          </View>
          <View style={[styles.cell, { width: supplierFinalW }]}>
            <Text style={styles.textBoldRight}>{fmtMoney(getVal(s.id))}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
  return (
    <>
      {renderRow('TOPLAM (KDV HARİÇ)', (sid) => totals.columnTotalsExKdv[sid], false)}
      {renderRow(`TOPLAM (KDV %${kdvRate} DAHİL)`, (sid) => totals.columnTotalsIncKdv[sid], true)}
    </>
  );
};

// ============================================================================
// SupplierFooterRows — Ödeme Şekli / Teslim / Teknik / Yetkili / Telefon
// ============================================================================

interface SupplierFooterRowsProps {
  suppliers: SupplierCol[];
  fixedLeft: number;
  supplierTotalW: number;
}

const SupplierFooterRows: React.FC<SupplierFooterRowsProps> = ({
  suppliers, fixedLeft, supplierTotalW,
}) => {
  if (suppliers.length === 0) return null;
  const rows: { label: string; key: keyof SupplierCol }[] = [
    { label: 'ÖDEME ŞEKLİ', key: 'payment_terms' },
    { label: 'TESLİM SÜRESİ', key: 'delivery_time' },
    { label: 'TEKNİK AÇIKLAMA', key: 'technical_description' },
    { label: 'FİRMA YETKİLİSİ', key: 'contact_name' },
    { label: 'TELEFON', key: 'contact_phone' },
  ];
  return (
    <>
      {rows.map((r) => (
        <View key={r.key} style={styles.row} wrap={false}>
          <View style={[styles.cell, styles.bgSub, { width: fixedLeft }]}>
            <Text style={styles.textBold}>{r.label}</Text>
          </View>
          {suppliers.map((s) => (
            <View key={s.id} style={[styles.cell, { width: supplierTotalW }]}>
              <Text style={styles.text}>{(s[r.key] as string | null | undefined) || '-'}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
};

// ============================================================================
// RequestInfoSection — Proje / Şirket / Konu / İçerik / Miktar / Sebep / Notlar
// ============================================================================

interface RequestInfoProps {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  mukayeseRequest: any;
  requester: any;
  request: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  totalRowW: number;
}

const RequestInfoSection: React.FC<RequestInfoProps> = ({
  mukayeseRequest, requester, totalRowW,
}) => {
  const labelW = 150;
  const valueW = totalRowW - labelW;
  const requesterName = requester
    ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim()
    : '-';
  const rows: { label: string; value: string }[] = [
    { label: 'ŞİRKET', value: mukayeseRequest.company || '-' },
    { label: 'KONU', value: mukayeseRequest.subject || '-' },
    { label: 'TALEP İÇERİĞİ', value: mukayeseRequest.request_content || '-' },
    { label: 'TALEP MİKTARI / TUTARI', value: mukayeseRequest.request_amount_text || '-' },
    { label: 'TALEP NEDENİ', value: mukayeseRequest.request_reason || '-' },
    { label: 'HAZIRLAYAN', value: requesterName },
  ];
  return (
    <>
      <View style={[styles.row, styles.bgHeader]} wrap={false}>
        <View style={[styles.cellLast, { width: totalRowW, alignItems: 'center' }]}>
          <Text style={styles.textTitleLg}>TALEP BİLGİLERİ</Text>
        </View>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row} wrap={false}>
          <View style={[styles.reqLabel, styles.bgSub, { width: labelW }]}>
            <Text style={styles.textBold}>{r.label}</Text>
          </View>
          <View style={[styles.reqValue, { width: valueW }]}>
            <Text style={styles.text}>{r.value}</Text>
          </View>
        </View>
      ))}
    </>
  );
};

// ============================================================================
// SignatureSection — Talep sahibi + onaylayanlar
// ============================================================================

interface SignatureSectionProps {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  approvals: any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  signatures: Record<string, SignatureInfo>;
  totalRowW: number;
}

const SignatureSection: React.FC<SignatureSectionProps> = ({
  approvals, signatures, totalRowW,
}) => {
  const sortedApprovals = [...(approvals || [])].sort(
    (a, b) => (a.workflow_step?.step_order ?? 0) - (b.workflow_step?.step_order ?? 0),
  );
  const blocks = sortedApprovals.map((a) => ({
    role: (a.workflow_step?.name || a.workflow_step?.static_position?.title || 'ONAY').toUpperCase(),
    name: a.approver
      ? `${a.approver.first_name || ''} ${a.approver.last_name || ''}`.trim()
      : '-',
    sig: a.status === 'APPROVED'
      ? renderSig(signatures, a.approver?.id)
      : <Text style={styles.signaturePending}>{a.status === 'REJECTED' ? 'Reddedildi' : ''}</Text>,
    meta: a.decided_at ? format(new Date(a.decided_at), 'dd.MM.yyyy') : '',
  }));
  const cellW = Math.floor(totalRowW / Math.max(blocks.length, 1));
  return (
    <View style={styles.row} wrap={false}>
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        return (
          <View
            key={i}
            style={[last ? styles.signatureCellLast : styles.signatureCell, { width: cellW }]}
          >
            <Text style={styles.signatureRoleText}>{b.role}</Text>
            <Text style={styles.signatureNameText}>{b.name}</Text>
            <View style={styles.signatureBox}>{b.sig}</View>
            {b.meta ? <Text style={styles.signatureMeta}>{b.meta}</Text> : null}
          </View>
        );
      })}
    </View>
  );
};



