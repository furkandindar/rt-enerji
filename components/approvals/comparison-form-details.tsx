"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Sigma } from "lucide-react";
import type { Approval, PendingApproval } from "@/lib/approvals/types";
import type { PreviousStepAttachment } from "@/lib/workflow/types";
import { ApprovalStatusBadge } from "./status-badge";
import { AttachmentList } from "./attachment-list";

type MukayeseDetail = NonNullable<PendingApproval["request"]["mukayese_request"]>;

interface ComparisonFormDetailsProps {
  mukayese: MukayeseDetail;
  approvals?: Approval[];
  previousStepAttachments?: PreviousStepAttachment[];
}

const CURRENCY_SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };
const UNIT_LABEL: Record<string, string> = { ADET: "Adet", SET: "Set", GUN: "Gün" };

const moneyFmt = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtMoney = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return moneyFmt.format(Number(v));
};

export function ComparisonFormDetails({ mukayese, approvals = [], previousStepAttachments = [] }: ComparisonFormDetailsProps) {
  const items = useMemo(
    () => [...(mukayese.items || [])].sort((a, b) => a.row_order - b.row_order),
    [mukayese.items],
  );
  const suppliers = useMemo(
    () => [...(mukayese.suppliers || [])].sort((a, b) => a.column_order - b.column_order),
    [mukayese.suppliers],
  );
  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of mukayese.prices || []) {
      m[`${p.mukayese_item_id}:${p.mukayese_supplier_id}`] = Number(p.unit_price);
    }
    return m;
  }, [mukayese.prices]);

  const derived = useMemo(() => {
    const blockSums: Record<string, number> = {};
    for (const s of suppliers) blockSums[s.id] = 0;
    const subtotalValues: Record<string, Record<string, number>> = {};
    const minMaxByItem: Record<string, { min: number; max: number }> = {};
    const columnTotalsExKdv: Record<string, number> = {};
    for (const s of suppliers) columnTotalsExKdv[s.id] = 0;

    for (const it of items) {
      if (it.row_type === "ITEM") {
        const qty = typeof it.quantity === "number" ? it.quantity : Number(it.quantity) || 0;
        const filled: number[] = [];
        for (const s of suppliers) {
          const up = priceMap[`${it.id}:${s.id}`];
          if (typeof up === "number") {
            blockSums[s.id] += qty * up;
            columnTotalsExKdv[s.id] += qty * up;
            filled.push(up);
          }
        }
        if (filled.length >= 2) {
          minMaxByItem[it.id] = { min: Math.min(...filled), max: Math.max(...filled) };
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

    const kdvMul = 1 + (Number.isFinite(mukayese.kdv_rate) ? Number(mukayese.kdv_rate) : 0) / 100;
    const columnTotalsIncKdv: Record<string, number> = {};
    for (const s of suppliers) columnTotalsIncKdv[s.id] = columnTotalsExKdv[s.id] * kdvMul;

    return { subtotalValues, minMaxByItem, columnTotalsExKdv, columnTotalsIncKdv };
  }, [items, suppliers, priceMap, mukayese.kdv_rate]);

  const symbol = CURRENCY_SYMBOL[mukayese.form_currency] || mukayese.form_currency;

  const relatedApprovals = approvals
    .filter((a) => a.workflow_step?.approver_type === "DYNAMIC_USER_LIST")
    .sort((a, b) => a.sequence_order - b.sequence_order);

  let seq = 0;
  const nextSeq = () => ++seq;

  return (
    <>
      {/* Başlık alanları */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tarih</p>
          <p className="text-sm font-semibold">
            {format(new Date(mukayese.form_date), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Para Birimi / KDV</p>
          <p className="text-sm font-semibold">
            {mukayese.form_currency} ({symbol}) · KDV %{mukayese.kdv_rate}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Proje</p>
          <p className="text-sm font-semibold">{mukayese.project_title || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Şirket</p>
          <p className="text-sm font-semibold">{mukayese.company || "-"}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Konu</p>
        <p className="text-sm font-semibold">{mukayese.subject || "-"}</p>
      </div>

      {/* FX snapshot */}
      {mukayese.fx_snapshot_at && (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <p className="font-semibold text-muted-foreground mb-1">
            TCMB Kur Anlık Görüntüsü ({format(new Date(mukayese.fx_snapshot_at), "d MMM yyyy HH:mm", { locale: tr })})
          </p>
          <div className="grid grid-cols-3 gap-2">
            <span>EUR/TRY: <strong>{fmtMoney(mukayese.fx_eur_try)}</strong></span>
            <span>USD/TRY: <strong>{fmtMoney(mukayese.fx_usd_try)}</strong></span>
            <span>EUR/USD: <strong>{fmtMoney(mukayese.fx_eur_usd)}</strong></span>
          </div>
        </div>
      )}

      {/* Matris */}
      {items.length > 0 && suppliers.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Mukayese Matrisi ({symbol})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th rowSpan={2} className="sticky left-0 z-20 w-8 min-w-8 border-b py-1.5 px-2 font-medium text-center bg-muted/40">#</th>
                  <th rowSpan={2} className="sticky left-8 z-20 w-[180px] min-w-[180px] border-b py-1.5 px-2 font-medium bg-muted/40">Mal / Hizmet</th>
                  <th rowSpan={2} className="sticky left-[212px] z-20 w-16 min-w-16 border-b py-1.5 px-2 font-medium text-right bg-muted/40">Miktar</th>
                  <th rowSpan={2} className="sticky left-[276px] z-20 w-14 min-w-14 border-b border-r py-1.5 px-2 font-medium text-center bg-muted/40">Birim</th>
                  {suppliers.map((s) => (
                    <th key={s.id} colSpan={2} className="border-b border-l py-1.5 px-2 font-medium text-center bg-muted/40">
                      {s.company_name || "-"}
                    </th>
                  ))}
                </tr>
                <tr className="text-left">
                  {suppliers.flatMap((s) => [
                    <th
                      key={`${s.id}-bf`}
                      className="border-b border-l py-1 px-2 font-normal text-right text-[10px] text-muted-foreground min-w-[85px] bg-muted/40"
                    >
                      Birim Fiyat ({symbol})
                    </th>,
                    <th
                      key={`${s.id}-tf`}
                      className="border-b border-l py-1 px-2 font-normal text-right text-[10px] text-muted-foreground min-w-[85px] bg-muted/40"
                    >
                      Toplam Fiyat ({symbol})
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isSub = it.row_type === "SUBTOTAL";
                  const minMax = derived.minMaxByItem[it.id];
                  const qty = typeof it.quantity === "number" ? it.quantity : Number(it.quantity) || 0;
                  const rowBg = isSub ? "bg-amber-50 dark:bg-amber-950/30 font-semibold" : "";
                  const stickyBg = isSub ? "bg-amber-50 dark:bg-amber-950/30" : "bg-background";
                  return (
                    <tr key={it.id} className={`align-top ${rowBg}`}>
                      <td className={`sticky left-0 z-10 w-8 min-w-8 border-b py-1.5 px-2 text-center text-muted-foreground ${stickyBg}`}>
                        {isSub ? <Sigma className="inline h-3 w-3" /> : nextSeq()}
                      </td>
                      <td className={`sticky left-8 z-10 w-[180px] min-w-[180px] border-b py-1.5 px-2 ${stickyBg}`}>
                        {it.description || (isSub ? "Ara Toplam" : "-")}
                      </td>
                      <td className={`sticky left-[212px] z-10 w-16 min-w-16 border-b py-1.5 px-2 text-right whitespace-nowrap ${stickyBg}`}>
                        {isSub ? "" : fmtMoney(it.quantity)}
                      </td>
                      <td className={`sticky left-[276px] z-10 w-14 min-w-14 border-b border-r py-1.5 px-2 text-center ${stickyBg}`}>
                        {isSub ? "" : (UNIT_LABEL[it.unit || ""] || it.unit || "")}
                      </td>
                      {suppliers.flatMap((s) => {
                        if (isSub) {
                          const sub = derived.subtotalValues[it.id]?.[s.id] ?? 0;
                          return [
                            <td key={`${s.id}-bf`} className="border-b border-l py-1.5 px-2"></td>,
                            <td key={`${s.id}-tf`} className="border-b border-l py-1.5 px-2 text-right whitespace-nowrap">
                              {fmtMoney(sub)}
                            </td>,
                          ];
                        }
                        const up = priceMap[`${it.id}:${s.id}`];
                        const lineTotal = typeof up === "number" ? qty * up : null;
                        let cellClass = "";
                        if (minMax && typeof up === "number" && minMax.min !== minMax.max) {
                          if (up === minMax.min) cellClass = "bg-emerald-100 dark:bg-emerald-950/40";
                          else if (up === minMax.max) cellClass = "bg-rose-100 dark:bg-rose-950/40";
                        }
                        return [
                          <td key={`${s.id}-bf`} className={`border-b border-l py-1.5 px-2 text-right whitespace-nowrap ${cellClass}`}>
                            {typeof up === "number" ? fmtMoney(up) : "-"}
                          </td>,
                          <td key={`${s.id}-tf`} className={`border-b border-l py-1.5 px-2 text-right whitespace-nowrap ${cellClass}`}>
                            {lineTotal !== null ? fmtMoney(lineTotal) : "-"}
                          </td>,
                        ];
                      })}
                    </tr>
                  );
                })}
                <tr className="font-semibold bg-muted/30">
                  <td colSpan={4} className="sticky left-0 z-10 w-[332px] min-w-[332px] border-b border-r py-1.5 px-2 text-right bg-muted/30">
                    TOPLAM (KDV Hariç)
                  </td>
                  {suppliers.flatMap((s) => [
                    <td key={`${s.id}-bf`} className="border-b border-l py-1.5 px-2"></td>,
                    <td key={`${s.id}-tf`} className="border-b border-l py-1.5 px-2 text-right whitespace-nowrap">
                      {fmtMoney(derived.columnTotalsExKdv[s.id])}
                    </td>,
                  ])}
                </tr>
                <tr className="font-semibold bg-muted/30">
                  <td colSpan={4} className="sticky left-0 z-10 w-[332px] min-w-[332px] border-b border-r py-1.5 px-2 text-right bg-muted/30">
                    TOPLAM (KDV %{mukayese.kdv_rate} Dahil)
                  </td>
                  {suppliers.flatMap((s) => [
                    <td key={`${s.id}-bf`} className="border-b border-l py-1.5 px-2"></td>,
                    <td key={`${s.id}-tf`} className="border-b border-l py-1.5 px-2 text-right whitespace-nowrap">
                      {fmtMoney(derived.columnTotalsIncKdv[s.id])}
                    </td>,
                  ])}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Firma detayları (ödeme şekli, teslim, teknik, iletişim) */}
      {suppliers.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Firma Detayları</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="py-1.5 px-2 font-medium w-32">&nbsp;</th>
                  {suppliers.map((s) => (
                    <th key={s.id} className="py-1.5 px-2 font-medium border-l">
                      {s.company_name || "-"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "Ödeme Şekli", key: "payment_terms" },
                  { label: "Teslim Süresi", key: "delivery_time" },
                  { label: "Teknik Açıklama", key: "technical_description" },
                  { label: "Firma Yetkilisi", key: "contact_name" },
                  { label: "Telefon", key: "contact_phone" },
                ] as const).map((r) => (
                  <tr key={r.key} className="border-b last:border-0 align-top">
                    <td className="py-1.5 px-2 font-medium text-muted-foreground bg-muted/20">{r.label}</td>
                    {suppliers.map((s) => (
                      <td key={s.id} className="py-1.5 px-2 border-l">{s[r.key] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Talep bilgileri */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-sm font-semibold">Talep Bilgileri</p>
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Talep İçerik</p>
            <p className="whitespace-pre-wrap">{mukayese.request_content || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Talep Miktarı / Tutarı</p>
            <p className="whitespace-pre-wrap">{mukayese.request_amount_text || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Talep Nedeni</p>
            <p className="whitespace-pre-wrap">{mukayese.request_reason || "-"}</p>
          </div>
          {mukayese.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notlar</p>
              <p className="whitespace-pre-wrap">{mukayese.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Hazırlayan */}
      <div>
        <p className="text-sm font-medium text-muted-foreground">Hazırlayan</p>
        <p className="text-sm font-semibold">{mukayese.preparer_full_name || "-"}</p>
      </div>

      {/* İlgililer (varsa) */}
      {relatedApprovals.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">
            İlgililer <span className="text-xs text-muted-foreground font-normal">({relatedApprovals.length})</span>
          </p>
          <div className="space-y-2">
            {relatedApprovals.map((ra) => (
              <div key={ra.id} className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {ra.approver.first_name} {ra.approver.last_name}
                  </p>
                  <ApprovalStatusBadge status={ra.status} className="text-white" />
                </div>
                {ra.decided_at && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(ra.decided_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ek Dosyalar */}
      <AttachmentList attachments={previousStepAttachments} />
    </>
  );
}
