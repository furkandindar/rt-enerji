// Ağustos 2026 düzeniyle ({ROOT}/YYYY/AA-Ay/Belgeler/…) arşivlenmiş belgeleri
// organizasyon bazlı düzene taşıyan admin endpoint'i. Tek seferlik geçiş
// aracı; taşınacak belge kalmayınca çağrılar 0 aday döner.
//
//   GET  /api/admin/sharepoint-migrate[?limit=50]
//     → DRY-RUN: SharePoint'e dokunmaz, ilk `limit` adayın eski → yeni yolunu
//       ve toplam aday sayısını döner.
//
//   POST /api/admin/sharepoint-migrate  { limit?: number, dryRun?: boolean }
//     → Partiyi taşır (varsayılan 25 talep). `remaining` 0 olana kadar tekrar
//       çağrılır; taşınan talep otomatik olarak aday olmaktan çıkar.
//
// Yetki: ORG_ADMIN. PDF yeniden üretilmez — Storage'daki nihai belge (imzalı
// tarama dahil) yeni yola yüklenir, eski SharePoint kopyası silinir.

import { migrateArchiveLayout } from "@/lib/sharepoint/migrate-archive";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Parti başına ~25 talep × (Storage indirme + Graph PUT + DELETE); migrate-archive
// kendi zaman bütçesini (45s) bunun altında tutar.
export const maxDuration = 60;

const MAX_LIMIT = 100;

interface MigrateBody {
  limit?: number;
  dryRun?: boolean;
}

export async function GET(request: NextRequest) {
  const denied = await requireOrgAdmin();
  if (denied) return denied;

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  return runMigration({ limit, dryRun: true });
}

export async function POST(request: NextRequest) {
  const denied = await requireOrgAdmin();
  if (denied) return denied;

  let body: MigrateBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as MigrateBody;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON body. {limit?, dryRun?} bekleniyor." },
      { status: 400 }
    );
  }

  return runMigration({
    limit: parseLimit(body.limit),
    dryRun: body.dryRun === true,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function parseLimit(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

async function requireOrgAdmin(): Promise<NextResponse | null> {
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
    return NextResponse.json(
      { error: "Forbidden — admin yetkisi gerekli" },
      { status: 403 }
    );
  }

  return null;
}

async function runMigration(params: {
  limit?: number;
  dryRun: boolean;
}): Promise<NextResponse> {
  if (process.env.SHAREPOINT_SYNC_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, error: "SHAREPOINT_SYNC_ENABLED=true olmalı." },
      { status: 400 }
    );
  }

  const rootFolder = process.env.SHAREPOINT_ROOT_FOLDER ?? "Talepler";

  try {
    const result = await migrateArchiveLayout({
      rootFolder,
      limit: params.limit,
      dryRun: params.dryRun,
    });

    return NextResponse.json({
      ok: result.failed.length === 0,
      mode: params.dryRun ? "dry-run" : "migrate",
      ...result,
      note: params.dryRun
        ? `${result.candidatesTotal} talep taşınacak; ilk ${result.preview.length} tanesi 'preview' altında.`
        : result.remaining > 0
          ? `${result.remaining} talep kaldı — aynı isteği tekrar gönder.`
          : "Taşınacak talep kalmadı. SharePoint'te eski yıl klasörünün boş kaldığını doğrulayıp elle silebilirsin.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin-sharepoint-migrate] hata:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
