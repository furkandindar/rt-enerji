// Cron endpoint — SharePoint retry queue'yu işler.
//
// Tetiklenme: pg_cron + pg_net ile her 5 dakikada bir POST (HEAD yok, body opsiyonel).
// Auth: Authorization: Bearer <CRON_SECRET> header'ı zorunlu.
//
// Dev ortamında manuel test için:
//   curl -X POST http://localhost:3000/api/cron/sharepoint-sync-retry \
//        -H "Authorization: Bearer $CRON_SECRET"

import { processSharePointRetryQueue } from "@/lib/sharepoint/retry-worker";
import { NextRequest, NextResponse } from "next/server";

// Up to 20 entries × multi-step Graph upload her birinde — yeterli pencere lazım.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET env değişkeni tanımlı değil." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processSharePointRetryQueue();
    return NextResponse.json({ ok: true, ...result });
    // not: cron için skipBackoff=false (default). Admin endpoint farklı.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron-sharepoint-retry] worker hatası:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET ile de tetiklemeye izin ver (manuel browser test, secret yine zorunlu).
export async function GET(request: NextRequest) {
  return POST(request);
}
