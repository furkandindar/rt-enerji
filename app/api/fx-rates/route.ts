import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

export type FxRatesResponse = {
  eurTry: number;
  usdTry: number;
  eurUsd: number;
  sourceDate: string;
  fetchedAt: string;
};

type TcmbCurrency = {
  "@_Kod"?: string;
  ForexBuying?: string | number;
  ForexSelling?: string | number;
  CrossRateUSD?: string | number;
  CrossRateOther?: string | number;
};

type TcmbParsed = {
  Tarih_Date?: {
    "@_Tarih"?: string;
    "@_Date"?: string;
    Currency?: TcmbCurrency[];
  };
};

export async function GET() {
  try {
    const ttl = computeSecondsUntilNextTcmbUpdate();
    const res = await fetch(TCMB_URL, {
      next: { revalidate: ttl },
      headers: { Accept: "application/xml" },
    });

    if (!res.ok) {
      throw new Error(`TCMB responded with ${res.status}`);
    }

    const xml = await res.text();
    const rates = parseTcmbXml(xml);
    return NextResponse.json(rates);
  } catch (err) {
    console.error("fx-rates error:", err);
    return NextResponse.json(
      { error: "Döviz kuru servisi şu anda erişilemez" },
      { status: 503 },
    );
  }
}

function parseTcmbXml(xml: string): FxRatesResponse {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml) as TcmbParsed;
  const root = parsed.Tarih_Date;
  const list = root?.Currency;

  if (!root || !Array.isArray(list)) {
    throw new Error("TCMB XML yapısı beklenenden farklı");
  }

  const usd = list.find((c) => c["@_Kod"] === "USD");
  const eur = list.find((c) => c["@_Kod"] === "EUR");

  if (!usd?.ForexSelling || !eur?.ForexSelling) {
    throw new Error("USD veya EUR satış kuru bulunamadı");
  }

  const usdTry = Number(usd.ForexSelling);
  const eurTry = Number(eur.ForexSelling);
  // EUR/USD parite: EUR kaydının CrossRateOther alanı (örn. 1.1765)
  // Güvenlik için fallback olarak eurTry/usdTry hesabı kullanılır.
  const eurUsd = eur.CrossRateOther
    ? Number(eur.CrossRateOther)
    : eurTry / usdTry;

  if (!isFinite(usdTry) || !isFinite(eurTry) || !isFinite(eurUsd)) {
    throw new Error("Parse edilen kur değerleri geçersiz");
  }

  return {
    eurTry,
    usdTry,
    eurUsd,
    sourceDate: root["@_Tarih"] || root["@_Date"] || "",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * TCMB hafta içi ~15:30 TSİ'de günlük kur bültenini yayınlar.
 * Bu fonksiyon şu anki zamandan bir sonraki hafta içi 15:31 TSİ'ye kadar
 * kalan saniyeyi döndürür. Hafta sonunu ve gün sonrasını otomatik atlar.
 *
 * Next.js'in Data Cache'i her fetch sonucu için bu süreyi TTL olarak kullanır;
 * böylece TCMB'ye günde yalnızca 1 kez gidilir ama yayın sonrası en geç
 * 1 dakika içinde yeni kurlar yansır.
 */
function computeSecondsUntilNextTcmbUpdate(): number {
  const now = new Date();
  // Türkiye saati = UTC+3 (DST yok). 15:31 TSİ = 12:31 UTC.
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    12,
    31,
    0,
    0,
  ));

  while (
    target.getTime() <= now.getTime() ||
    target.getUTCDay() === 0 ||
    target.getUTCDay() === 6
  ) {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(12, 31, 0, 0);
  }

  const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
  return Math.max(seconds, 60);
}
