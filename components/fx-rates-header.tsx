"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

export function FxRatesHeader() {
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
    <>
      {/* Desktop: label sol, 3 kur sağda stack */}
      <div className="hidden items-center gap-4 text-xs sm:flex">
        <div className="flex flex-col leading-tight">
          <span className="font-medium">TCMB Döviz Kurları</span>
          <span className="text-muted-foreground">
            {data?.sourceDate ?? "—"}
          </span>
        </div>

        {isLoading ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Yükleniyor
          </span>
        ) : error ? (
          <span
            className="flex items-center gap-1 text-muted-foreground"
            title={error}
          >
            <AlertCircle className="h-3 w-3 text-destructive" />
            Hata
          </span>
        ) : (
          <div className="flex flex-col gap-0.5 leading-tight">
            {rows.map((row) => (
              <div
                key={row.pair}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-muted-foreground">{row.pair}</span>
                <span className="tabular-nums font-medium">
                  {row.value}
                  <span className="ml-0.5 text-muted-foreground">{row.suffix}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile: icon + popover */}
      <div className="sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Döviz kurları"
            >
              <TrendingUp className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="mb-2">
              <p className="text-sm font-semibold">Döviz Kurları</p>
              <p className="text-xs text-muted-foreground">
                {data?.sourceDate ? `TCMB · ${data.sourceDate}` : "TCMB"}
              </p>
            </div>

            {isLoading ? (
              <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Yükleniyor
              </div>
            ) : error ? (
              <div className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-destructive" />
                {error}
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {rows.map((row) => (
                  <div
                    key={row.pair}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {row.pair}
                    </span>
                    <span className="tabular-nums text-sm font-semibold">
                      {row.value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {row.suffix}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
