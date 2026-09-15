// SharePoint arşiv ağacını (statik kısım: kök → departman → birim → form →
// sonuç) önceden oluşturan admin endpoint'i. BT, klasör izinlerini belge
// gelmeden verebilsin diye.
//
//   GET  /api/admin/sharepoint-provision[?scope=<departman>]
//     → Her zaman DRY-RUN: Graph'a dokunmaz, açılacak klasör listesini döner.
//       Tarayıcıdan bakıp Nur Hanım'a onaylatmak için.
//
//   POST /api/admin/sharepoint-provision  { scope?: string, dryRun?: boolean }
//     → Klasörleri gerçekten açar. Idempotent — var olanlar "existing" sayılır.
//       Zaman bütçesi biterse completed=false döner; aynı çağrı tekrarlanır.
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

// ~530 klasör, 6 paralel istek — provision-tree kendi zaman bütçesini bunun
// altında tutar (48s) ki yanıt her zaman JSON olarak dönsün.
export const maxDuration = 60;

interface ProvisionBody {
  scope?: string;
  dryRun?: boolean;
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
  });
}

// ============================================================================
// Helpers
// ============================================================================

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
    });

    const { planned, ...summary } = result;

    return NextResponse.json({
      ok: result.failed.length === 0,
      mode: params.dryRun ? "dry-run" : "provision",
      config,
      ...summary,
      note: !result.completed
        ? `Zaman bütçesi doldu, ${result.skipped} klasör açılmadı. Aynı isteği tekrar gönder — var olanlar atlanır, kalanlar açılır.`
        : result.failed.length > 0
          ? "Bazı klasörler açılamadı; 'failed' listesine bak, düzeltip tekrar gönder."
          : undefined,
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
