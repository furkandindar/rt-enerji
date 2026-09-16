// SharePoint arşiv ağacını (statik kısım: kök → departman → birim → form →
// sonuç) önceden oluşturan admin endpoint'i. BT, klasör izinlerini belge
// gelmeden verebilsin diye.
//
//   GET  /api/admin/sharepoint-provision[?scope=<departman>]
//     → Her zaman DRY-RUN: Graph'a dokunmaz, açılacak klasör listesini döner.
//       Tarayıcıdan bakıp Nur Hanım'a onaylatmak için.
//
//   POST /api/admin/sharepoint-provision  { scope?, dryRun?, offset?, limit? }
//     → Planın bir partisini (varsayılan 80 klasör) açar, `nextOffset` döner;
//       `completed: true` olana kadar nextOffset ile tekrar çağrılır.
//       Idempotent — var olanlar "existing" sayılır. 530 klasörü tek istekte
//       açmak Vercel 60s sınırında 504 veriyordu; parti bu yüzden.
//
// Yetki: ORG_ADMIN rolü zorunlu (app_users.role). Yıl/ay klasörleri burada
// açılmaz, ilk belgeyle kendiliğinden oluşur.

import {
  resolveSharePointDrive,
  resolveSharePointSite,
} from "@/lib/msgraph/sharepoint";
import {
  listArchiveScopes,
  provisionArchiveTree,
} from "@/lib/sharepoint/provision-tree";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Parti başına 80 klasör, 4 paralel istek — provision-tree kendi zaman
// bütçesini (25s) bunun çok altında tutar ki yanıt her zaman JSON dönsün.
export const maxDuration = 60;

const MAX_LIMIT = 150;

interface ProvisionBody {
  scope?: string;
  dryRun?: boolean;
  offset?: number;
  limit?: number;
}

export async function GET(request: NextRequest) {
  const denied = await requireOrgAdmin();
  if (denied) return denied;

  const scope = request.nextUrl.searchParams.get("scope");
  return runProvision({ scope, dryRun: true });
}

export async function POST(request: NextRequest) {
  const denied = await requireOrgAdmin();
  if (denied) return denied;

  let body: ProvisionBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as ProvisionBody;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON body. {scope?, dryRun?} bekleniyor." },
      { status: 400 }
    );
  }

  return runProvision({
    scope: body.scope ?? null,
    dryRun: body.dryRun === true,
    offset: parseNonNegativeInt(body.offset),
    limit: parseNonNegativeInt(body.limit, MAX_LIMIT),
  });
}

// ============================================================================
// Helpers
// ============================================================================

function parseNonNegativeInt(raw: unknown, max?: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return undefined;
  const n = Math.floor(raw);
  return max ? Math.min(n, max) : n;
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

async function runProvision(params: {
  scope: string | null;
  dryRun: boolean;
  offset?: number;
  limit?: number;
}): Promise<NextResponse> {
  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  const libraryName = process.env.SHAREPOINT_LIBRARY_NAME ?? "Documents";
  const rootFolder = process.env.SHAREPOINT_ROOT_FOLDER ?? "Talepler";

  if (!siteUrl) {
    return NextResponse.json(
      { error: "SHAREPOINT_SITE_URL env değişkeni tanımlı değil." },
      { status: 500 }
    );
  }

  const scope = params.scope?.trim() || null;
  if (scope) {
    const scopes = listArchiveScopes(rootFolder);
    if (!scopes.includes(scope)) {
      return NextResponse.json(
        {
          error: `Geçersiz scope: "${scope}". Kök altındaki departman klasörlerinden biri olmalı.`,
          availableScopes: scopes,
        },
        { status: 400 }
      );
    }
  }

  const config = { siteUrl, libraryName, rootFolder };

  try {
    // Dry-run Graph'a hiç dokunmaz — site/drive çözümü de yapılmaz ki
    // yanlış env'de bile plan güvenle görülebilsin.
    let driveId = "";
    if (!params.dryRun) {
      const siteId = await resolveSharePointSite(siteUrl);
      driveId = await resolveSharePointDrive(siteId, libraryName);
    }

    const result = await provisionArchiveTree({
      driveId,
      rootFolder,
      scope,
      dryRun: params.dryRun,
      offset: params.offset,
      limit: params.limit && params.limit > 0 ? params.limit : undefined,
    });

    const { planned, ...summary } = result;

    return NextResponse.json({
      ok: result.failed.length === 0,
      mode: params.dryRun ? "dry-run" : "provision",
      config,
      ...summary,
      note: params.dryRun
        ? `${result.totalFolders} klasör açılacak (${result.leafCount} yaprak).`
        : result.budgetExceeded
          ? `Zaman bütçesi doldu, parti yarım kaldı. Aynı offset (${result.nextOffset}) ile tekrar gönder — açılanlar atlanır.`
          : !result.completed
            ? `${result.nextOffset}/${result.totalFolders} — devam için body'de offset: ${result.nextOffset} gönder.`
            : result.failed.length > 0
              ? "Plan bitti ama bazı klasörler açılamadı; 'failed' listesine bak, aynı offset ile tekrar gönder."
              : "Plan bitti, tüm klasörler mevcut.",
      // Dry-run'da tam liste (onaylatmak için); gerçek çalıştırmada yalnız özet.
      planned: params.dryRun ? planned : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin-sharepoint-provision] hata:", message);
    return NextResponse.json(
      { ok: false, error: message, config },
      { status: 500 }
    );
  }
}
