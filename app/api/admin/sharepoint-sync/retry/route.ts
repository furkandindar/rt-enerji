// Admin manual retry endpoint — SharePoint sync için.
//
// İki mod:
//   POST { requestId: "<uuid>" }   → o talep için en güncel queue kaydını retry et
//                                     (backoff bypass, success'i bile yeniden yükler)
//   POST { all: true }              → kuyrukta pending/failed olan herkesi işle
//                                     (backoff bypass — admin bilinçli istiyor)
//
// Yetki: ORG_ADMIN rolü zorunlu (app_users.role).

import {
  processSharePointRetryQueue,
  retryQueueEntryForRequest,
} from "@/lib/sharepoint/retry-worker";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Admin "all" modunda queue'nun tamamı işlenebilir — geniş pencere şart.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1) Auth + role check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (appUser?.role !== "ORG_ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin yetkisi gerekli" }, { status: 403 });
  }

  // 2) Body parse
  let body: { requestId?: string; all?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON body. {requestId} veya {all:true} bekleniyor." },
      { status: 400 }
    );
  }

  if (!body.requestId && !body.all) {
    return NextResponse.json(
      { error: "requestId veya all:true verilmeli." },
      { status: 400 }
    );
  }

  if (body.requestId && body.all) {
    return NextResponse.json(
      { error: "requestId ve all aynı anda kullanılamaz." },
      { status: 400 }
    );
  }

  // 3) Dispatch
  try {
    if (body.requestId) {
      const result = await retryQueueEntryForRequest(body.requestId);
      return NextResponse.json({
        ok: result.outcome === "success",
        mode: "single",
        triggeredBy: user.email,
        result,
      });
    }

    // body.all === true
    const result = await processSharePointRetryQueue({ skipBackoff: true });
    return NextResponse.json({
      ok: true,
      mode: "all",
      triggeredBy: user.email,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin-sharepoint-retry] hata:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
