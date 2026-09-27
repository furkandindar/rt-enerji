import {
  bagEntries,
  MUKAYESE_CURRENCY_SYMBOL,
  type MoneyBag,
} from "@/lib/comparison-form/matrix-totals";

const moneyFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Para birimine göre ayrılmış tutarı alt alta yazar; boşsa "—" */
export function MoneyBagLines({ bag }: { bag: MoneyBag | undefined }) {
  const entries = bagEntries(bag);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-end">
      {entries.map((e) => (
        <span key={e.currency} className="whitespace-nowrap">
          {moneyFormatter.format(e.amount)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {MUKAYESE_CURRENCY_SYMBOL[e.currency]}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Tek TL tutarı; null → "—" */
export function TryAmount({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap">
      {moneyFormatter.format(value)}{" "}
      <span className="text-xs font-normal text-muted-foreground">₺</span>
    </span>
  );
}
