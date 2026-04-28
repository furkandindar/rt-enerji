"use client";

import { Fragment, useMemo } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Building2,
  Sigma,
  Package,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

import type { MukayeseCurrency, MukayeseRowType, MukayeseUnit } from "@/lib/workflow/types";

// ----------------------------------------------------------------------------
// Tipler — client-side matris state
// ----------------------------------------------------------------------------

export interface MatrixItem {
  id: string; // client-only; backend'e gitmez
  row_type: MukayeseRowType;
  description: string;
  quantity: number | null;
  unit: MukayeseUnit | null;
}

export interface MatrixSupplier {
  id: string; // client-only
  company_name: string;
  payment_terms: string;
  delivery_time: string;
  technical_description: string;
  contact_name: string;
  contact_phone: string;
}

// `${item.id}:${supplier.id}` → unit_price
export type MatrixPrices = Record<string, number>;

export interface MatrixEditorProps {
  items: MatrixItem[];
  onItemsChange: (next: MatrixItem[]) => void;
  suppliers: MatrixSupplier[];
  onSuppliersChange: (next: MatrixSupplier[]) => void;
  prices: MatrixPrices;
  onPricesChange: (next: MatrixPrices) => void;
  currency: MukayeseCurrency;
  kdvRate: number; // % — kolon toplamları için
  disabled?: boolean;
}

// ----------------------------------------------------------------------------
// Yardımcılar
// ----------------------------------------------------------------------------

const UNIT_OPTIONS: { value: MukayeseUnit; label: string }[] = [
  { value: "ADET", label: "Adet" },
  { value: "SET", label: "Set" },
  { value: "GUN", label: "Gün" },
];

const CURRENCY_SYMBOL: Record<MukayeseCurrency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
};

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export const cellKey = (itemId: string, supplierId: string) => `${itemId}:${supplierId}`;

const moneyFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Boş yeni kalem satırı
const blankItem = (row_type: MukayeseRowType): MatrixItem => ({
  id: newClientId(),
  row_type,
  description: "",
  quantity: row_type === "ITEM" ? 1 : null,
  unit: row_type === "ITEM" ? "ADET" : null,
});

// Boş yeni firma sütunu
const blankSupplier = (): MatrixSupplier => ({
  id: newClientId(),
  company_name: "",
  payment_terms: "",
  delivery_time: "",
  technical_description: "",
  contact_name: "",
  contact_phone: "",
});

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function MatrixEditor({
  items,
  onItemsChange,
  suppliers,
  onSuppliersChange,
  prices,
  onPricesChange,
  currency,
  kdvRate,
  disabled = false,
}: MatrixEditorProps) {
  const symbol = CURRENCY_SYMBOL[currency];

  // İndeks bazlı sıra numarası — sadece ITEM satırlarını numaralandırırız
  const itemDisplayNumbers = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const it of items) {
      if (it.row_type === "ITEM") {
        n += 1;
        map.set(it.id, n);
      }
    }
    return map;
  }, [items]);

  // -------- Türetilmiş değerler: SUBTOTAL, kolon toplamı, min/max --------
  const derived = useMemo(() => {
    // Her firma için bloklar arası akümülatör
    const blockSums: Record<string, number> = {};
    for (const s of suppliers) blockSums[s.id] = 0;

    // itemId -> { supplierId -> blok toplamı } (yalnız SUBTOTAL satırlar için dolu)
    const subtotalValues: Record<string, Record<string, number>> = {};
    // itemId -> { min, max } (yalnız ITEM satırlar için dolu, dolu hücre sayısı >= 2 olduğunda)
    const minMaxByItem: Record<string, { min: number; max: number }> = {};
    // supplierId -> tüm ITEM line-total toplamı (KDV hariç genel toplam)
    const columnTotalsExKdv: Record<string, number> = {};
    for (const s of suppliers) columnTotalsExKdv[s.id] = 0;

    for (const it of items) {
      if (it.row_type === "ITEM") {
        const qty = typeof it.quantity === "number" ? it.quantity : 0;
        const lineTotalsForRow: number[] = [];
        for (const s of suppliers) {
          const up = prices[cellKey(it.id, s.id)];
          if (typeof up === "number") {
            const lineTotal = qty * up;
            blockSums[s.id] += lineTotal;
            columnTotalsExKdv[s.id] += lineTotal;
            lineTotalsForRow.push(up); // min/max birim fiyat üstünden hesaplanır
          }
        }
        if (lineTotalsForRow.length >= 2) {
          minMaxByItem[it.id] = {
            min: Math.min(...lineTotalsForRow),
            max: Math.max(...lineTotalsForRow),
          };
        }
      } else {
        // SUBTOTAL — biriken blok toplamlarını yaz, sonra resetle
        const row: Record<string, number> = {};
        for (const s of suppliers) {
          row[s.id] = blockSums[s.id];
          blockSums[s.id] = 0;
        }
        subtotalValues[it.id] = row;
      }
    }

    const kdvMultiplier = 1 + (Number.isFinite(kdvRate) ? kdvRate : 0) / 100;
    const columnTotalsIncKdv: Record<string, number> = {};
    for (const s of suppliers) {
      columnTotalsIncKdv[s.id] = columnTotalsExKdv[s.id] * kdvMultiplier;
    }

    return { subtotalValues, minMaxByItem, columnTotalsExKdv, columnTotalsIncKdv };
  }, [items, suppliers, prices, kdvRate]);

  // -------- Item handlers --------
  const addItemRow = (row_type: MukayeseRowType) => {
    onItemsChange([...items, blankItem(row_type)]);
  };

  const updateItem = (id: string, patch: Partial<MatrixItem>) => {
    onItemsChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((it) => it.id !== id));
    // İlgili tüm fiyatları da temizle
    const next: MatrixPrices = {};
    for (const [k, v] of Object.entries(prices)) {
      if (!k.startsWith(`${id}:`)) next[k] = v;
    }
    onPricesChange(next);
  };

  const moveItem = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onItemsChange(next);
  };

  // -------- Supplier handlers --------
  const addSupplier = () => {
    onSuppliersChange([...suppliers, blankSupplier()]);
  };

  const updateSupplier = (id: string, patch: Partial<MatrixSupplier>) => {
    onSuppliersChange(suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSupplier = (id: string) => {
    onSuppliersChange(suppliers.filter((s) => s.id !== id));
    const next: MatrixPrices = {};
    for (const [k, v] of Object.entries(prices)) {
      if (!k.endsWith(`:${id}`)) next[k] = v;
    }
    onPricesChange(next);
  };

  const moveSupplier = (id: string, dir: -1 | 1) => {
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= suppliers.length) return;
    const next = suppliers.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onSuppliersChange(next);
  };

  // -------- Price handlers --------
  const setCellPrice = (itemId: string, supplierId: string, raw: string) => {
    const key = cellKey(itemId, supplierId);
    if (raw.trim() === "") {
      const { [key]: _drop, ...rest } = prices;
      void _drop;
      onPricesChange(rest);
      return;
    }
    const num = Number(raw.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    onPricesChange({ ...prices, [key]: num });
  };

  const isEmpty = items.length === 0 && suppliers.length === 0;

  return (
    <div className="space-y-3">
      {/* Üst toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addItemRow("ITEM")}
          disabled={disabled}
        >
          <Package className="mr-2 h-4 w-4" /> Kalem Satırı Ekle
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addItemRow("SUBTOTAL")}
          disabled={disabled || items.filter((it) => it.row_type === "ITEM").length === 0}
        >
          <Sigma className="mr-2 h-4 w-4" /> Ara Toplam Satırı Ekle
        </Button>
        <div className="ml-auto" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addSupplier}
          disabled={disabled}
        >
          <Building2 className="mr-2 h-4 w-4" /> Firma Sütunu Ekle
        </Button>
      </div>

      {isEmpty ? (
        <div className="rounded-md border-2 border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Başlamak için bir kalem satırı ve bir firma sütunu ekleyin.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="border-separate border-spacing-0 text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 w-12 min-w-12 border-b border-r bg-muted/50 px-2 py-2 text-center font-medium"
                >
                  #
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-12 z-20 w-[300px] min-w-[300px] border-b border-r bg-muted/50 px-2 py-2 text-left font-medium"
                >
                  Açıklama
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[348px] z-20 w-24 min-w-24 border-b border-r bg-muted/50 px-2 py-2 text-right font-medium"
                >
                  Miktar
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[444px] z-20 w-24 min-w-24 border-b border-r bg-muted/50 px-2 py-2 text-left font-medium"
                >
                  Birim
                </th>
                {suppliers.map((s, sIdx) => (
                  <th
                    key={s.id}
                    colSpan={2}
                    className="border-b border-r px-2 py-2 align-top font-medium"
                  >
                    <SupplierHeaderCell
                      supplier={s}
                      index={sIdx}
                      total={suppliers.length}
                      disabled={disabled}
                      onChange={(patch) => updateSupplier(s.id, patch)}
                      onRemove={() => removeSupplier(s.id)}
                      onMove={(dir) => moveSupplier(s.id, dir)}
                    />
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="w-24 min-w-24 border-b px-2 py-2 text-center font-medium"
                >
                  Aksiyonlar
                </th>
              </tr>
              <tr className="bg-muted/30">
                {suppliers.map((s) => (
                  <Fragment key={s.id}>
                    <th className="w-[120px] min-w-[120px] border-b border-r px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Birim Fiyat
                    </th>
                    <th className="w-[120px] min-w-[120px] border-b border-r px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Toplam Fiyat
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  index={idx}
                  total={items.length}
                  displayNumber={itemDisplayNumbers.get(it.id)}
                  suppliers={suppliers}
                  prices={prices}
                  currency={symbol}
                  disabled={disabled}
                  subtotalValues={derived.subtotalValues[it.id]}
                  minMax={derived.minMaxByItem[it.id]}
                  onChange={(patch) => updateItem(it.id, patch)}
                  onRemove={() => removeItem(it.id)}
                  onMove={(dir) => moveItem(it.id, dir)}
                  onCellChange={(supplierId, raw) => setCellPrice(it.id, supplierId, raw)}
                />
              ))}
            </tbody>
            {suppliers.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-medium">
                  <td
                    colSpan={4}
                    className="sticky left-0 z-10 border-t border-r bg-muted/40 px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Toplam (KDV Hariç)
                  </td>
                  {suppliers.map((s) => (
                    <td
                      key={s.id}
                      colSpan={2}
                      className="border-t border-r px-2 py-2 text-right tabular-nums"
                    >
                      {moneyFormatter.format(derived.columnTotalsExKdv[s.id] ?? 0)}{" "}
                      <span className="text-xs text-muted-foreground">{symbol}</span>
                    </td>
                  ))}
                  <td className="border-t" />
                </tr>
                <tr className="bg-muted/60 font-semibold">
                  <td
                    colSpan={4}
                    className="sticky left-0 z-10 border-t border-r bg-muted/60 px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Toplam (KDV Dahil · %{Number.isFinite(kdvRate) ? kdvRate : 0})
                  </td>
                  {suppliers.map((s) => (
                    <td
                      key={s.id}
                      colSpan={2}
                      className="border-t border-r px-2 py-2 text-right tabular-nums"
                    >
                      {moneyFormatter.format(derived.columnTotalsIncKdv[s.id] ?? 0)}{" "}
                      <span className="text-xs text-muted-foreground">{symbol}</span>
                    </td>
                  ))}
                  <td className="border-t" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SupplierHeaderCell — firma sütunu başlığı: ad + detay popover + aksiyonlar
// ----------------------------------------------------------------------------

interface SupplierHeaderCellProps {
  supplier: MatrixSupplier;
  index: number;
  total: number;
  disabled?: boolean;
  onChange: (patch: Partial<MatrixSupplier>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function SupplierHeaderCell({
  supplier,
  index,
  total,
  disabled,
  onChange,
  onRemove,
  onMove,
}: SupplierHeaderCellProps) {
  return (
    <div className="space-y-1.5">
      <Input
        value={supplier.company_name}
        onChange={(e) => onChange({ company_name: e.target.value })}
        placeholder={`Firma ${index + 1}`}
        disabled={disabled}
        className="h-8 font-semibold"
      />
      <div className="flex items-center justify-between gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={disabled}
            >
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Detay
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3" align="start">
            <div className="space-y-1">
              <Label className="text-xs">Ödeme Şartı</Label>
              <Input
                value={supplier.payment_terms}
                onChange={(e) => onChange({ payment_terms: e.target.value })}
                placeholder="Örn. %30 peşin, %70 teslimde"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teslim Süresi</Label>
              <Input
                value={supplier.delivery_time}
                onChange={(e) => onChange({ delivery_time: e.target.value })}
                placeholder="Örn. 30 gün"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teknik Açıklama</Label>
              <Textarea
                rows={2}
                value={supplier.technical_description}
                onChange={(e) => onChange({ technical_description: e.target.value })}
                placeholder="Teknik notlar"
                disabled={disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Yetkili</Label>
                <Input
                  value={supplier.contact_name}
                  onChange={(e) => onChange({ contact_name: e.target.value })}
                  placeholder="Ad Soyad"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefon</Label>
                <Input
                  value={supplier.contact_phone}
                  onChange={(e) => onChange({ contact_phone: e.target.value })}
                  placeholder="Telefon"
                  disabled={disabled}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            title="Sola taşı"
          >
            <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onMove(1)}
            disabled={disabled || index === total - 1}
            title="Sağa taşı"
          >
            <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
            title="Sütunu sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ItemRow — tek kalem (veya ara toplam) satırı + her firma için hücre
// ----------------------------------------------------------------------------

interface ItemRowProps {
  item: MatrixItem;
  index: number;
  total: number;
  displayNumber?: number;
  suppliers: MatrixSupplier[];
  prices: MatrixPrices;
  currency: string;
  disabled?: boolean;
  subtotalValues?: Record<string, number>;
  minMax?: { min: number; max: number };
  onChange: (patch: Partial<MatrixItem>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onCellChange: (supplierId: string, raw: string) => void;
}

function ItemRow({
  item,
  index,
  total,
  displayNumber,
  suppliers,
  prices,
  currency,
  disabled,
  subtotalValues,
  minMax,
  onChange,
  onRemove,
  onMove,
  onCellChange,
}: ItemRowProps) {
  const isSubtotal = item.row_type === "SUBTOTAL";
  const rowBg = isSubtotal ? "bg-amber-50/40 dark:bg-amber-950/20" : "";
  const stickyBg = isSubtotal ? "bg-amber-50 dark:bg-amber-950/30" : "bg-background";

  return (
    <tr className={rowBg}>
      <td
        className={`sticky left-0 z-10 w-12 min-w-12 border-b border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground ${stickyBg}`}
      >
        {isSubtotal ? <Sigma className="mx-auto h-3.5 w-3.5" /> : displayNumber ?? ""}
      </td>
      <td
        className={`sticky left-12 z-10 w-[300px] min-w-[300px] border-b border-r px-2 py-1.5 ${stickyBg}`}
      >
        <Input
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={isSubtotal ? "Ara toplam açıklaması" : "Kalem açıklaması"}
          disabled={disabled}
          className="h-8 w-full"
        />
      </td>
      <td className={`sticky left-[348px] z-10 w-24 min-w-24 border-b border-r px-2 py-1.5 ${stickyBg}`}>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={item.quantity ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ quantity: v === "" ? null : Number(v) });
          }}
          disabled={disabled || isSubtotal}
          className="h-8 w-full text-right tabular-nums"
        />
      </td>
      <td className={`sticky left-[444px] z-10 w-24 min-w-24 border-b border-r px-2 py-1.5 ${stickyBg}`}>
        <Select
          value={item.unit ?? undefined}
          onValueChange={(v) => onChange({ unit: v as MukayeseUnit })}
          disabled={disabled || isSubtotal}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      {suppliers.map((s) => {
        if (isSubtotal) {
          const sub = subtotalValues?.[s.id] ?? 0;
          return (
            <td
              key={s.id}
              colSpan={2}
              className="w-60 min-w-60 border-b border-r px-2 py-1.5 text-right tabular-nums font-semibold"
            >
              {moneyFormatter.format(sub)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{currency}</span>
            </td>
          );
        }
        const value = prices[cellKey(item.id, s.id)];
        const qty = typeof item.quantity === "number" ? item.quantity : 0;
        const lineTotal = typeof value === "number" ? qty * value : null;
        // min/max sadece >=2 dolu hücre varsa gelir; min === max ise renk verme
        let cellBg = "";
        if (
          minMax &&
          typeof value === "number" &&
          minMax.min !== minMax.max
        ) {
          if (value === minMax.min) cellBg = "bg-emerald-50 dark:bg-emerald-950/40";
          else if (value === minMax.max) cellBg = "bg-rose-50 dark:bg-rose-950/40";
        }
        return (
          <Fragment key={s.id}>
            <td
              className={`w-[120px] min-w-[120px] border-b border-r px-2 py-1.5 ${cellBg}`}
            >
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={value ?? ""}
                  onChange={(e) => onCellChange(s.id, e.target.value)}
                  disabled={disabled}
                  placeholder="0"
                  className="h-8 text-right tabular-nums"
                />
                <span className="text-xs text-muted-foreground">{currency}</span>
              </div>
            </td>
            <td
              className={`w-[120px] min-w-[120px] border-b border-r px-2 py-1.5 text-right tabular-nums ${cellBg}`}
            >
              {lineTotal !== null ? (
                <>
                  {moneyFormatter.format(lineTotal)}{" "}
                  <span className="text-xs text-muted-foreground">{currency}</span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </Fragment>
        );
      })}
      <td className="w-24 min-w-24 border-b px-2 py-1.5">
        <div className="flex items-center justify-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            title="Yukarı taşı"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onMove(1)}
            disabled={disabled || index === total - 1}
            title="Aşağı taşı"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
            title="Satırı sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}



