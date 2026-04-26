"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { FxRatesResponse } from "@/app/api/fx-rates/route";

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const parityFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

type Row = { pair: string; value: string; suffix: string };

export function FxRatesWidget() {
  const [data, setData] = useState<FxRatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fx-rates");
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error ?? "Kurlar alınamadı");
        } else {
          setData(body as FxRatesResponse);
        }
      } catch {
        if (!cancelled) setError("Kurlar alınamadı");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Row[] = data
    ? [
        { pair: "EUR/TRY", value: tryFormatter.format(data.eurTry), suffix: "₺" },
        { pair: "USD/TRY", value: tryFormatter.format(data.usdTry), suffix: "₺" },
        { pair: "EUR/USD", value: parityFormatter.format(data.eurUsd), suffix: "$" },
      ]
    : [];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Döviz Kurları</CardTitle>
          <CardDescription>
            {data?.sourceDate ? `TCMB · ${data.sourceDate}` : "TCMB"}
          </CardDescription>
        </div>
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Kurlar yükleniyor…
          </div>
        ) : error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {error}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {rows.map((row) => (
              <div
                key={row.pair}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium text-muted-foreground">
                  {row.pair}
                </span>
                <span className="tabular-nums text-base font-semibold">
                  {row.value}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {row.suffix}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
