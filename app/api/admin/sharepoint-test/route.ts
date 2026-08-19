// SharePoint test endpoint'i.
//
// İki mod:
//   GET /api/admin/sharepoint-test
//     → Wrapper smoke test (site/drive resolve + test klasör + test .txt upload).
//       Hiçbir veriyi etkilemez. Faz 2 doğrulaması.
//
//   GET /api/admin/sharepoint-test?requestId=<uuid>
//     → Verilen talep için PDF'i yeniden üretip Supabase + SharePoint'e yükler.
//       requests tablosundaki sharepoint_* alanları güncellenir. Faz 4 e2e test.
//
// Authenticated kullanıcı yeterli. Production'da silinecek / kapatılacak.

import { buildAndUploadRequestPDF } from "@/lib/pdf/build-and-upload-request-pdf";
import { isArchivableStatus } from "@/lib/pdf/file-naming";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import {
  ensureFolderPath,
  resolveSharePointDrive,
  resolveSharePointSite,
  uploadFileToSharePoint,
} from "@/lib/msgraph/sharepoint";
import { NextRequest, NextResponse } from "next/server";

// full-sync modu PDF gen + SharePoint zinciri + 15s polling içeriyor.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = request.nextUrl.searchParams.get("requestId");

  if (requestId) {
    return runFullSyncTest(requestId);
  }

  return runSmokeTest(user.email ?? "unknown");
}

// ============================================================================
// Mode 1 — Smoke test (Faz 2)
// ============================================================================

async function runSmokeTest(userEmail: string): Promise<NextResponse> {
  const siteUrl = process.env.SHAREPOINT_SITE_URL;
  const libraryName = process.env.SHAREPOINT_LIBRARY_NAME ?? "Documents";
  const rootFolder = process.env.SHAREPOINT_ROOT_FOLDER ?? "Talepler";

  if (!siteUrl) {
    return NextResponse.json(
      { error: "SHAREPOINT_SITE_URL env değişkeni tanımlı değil." },
      { status: 500 }
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const testFolderPath = `${rootFolder}/_test/${stamp}`;
  const testFileName = `smoke-test-${stamp}.txt`;
  const testContent = Buffer.from(
    `SharePoint wrapper smoke test\nTime: ${new Date().toISOString()}\nUser: ${userEmail}\n`,
    "utf-8"
  );

  const steps: Record<string, unknown> = {
    mode: "smoke",
    config: { siteUrl, libraryName, rootFolder },
  };

  try {
    const siteId = await resolveSharePointSite(siteUrl);
    steps.siteId = siteId;

    const driveId = await resolveSharePointDrive(siteId, libraryName);
    steps.driveId = driveId;

    await ensureFolderPath(driveId, testFolderPath);
    steps.folderEnsured = testFolderPath;

    const uploaded = await uploadFileToSharePoint({
      driveId,
      folderPath: testFolderPath,
      fileName: testFileName,
      buffer: testContent,
      contentType: "text/plain; charset=utf-8",
    });
    steps.uploadedFile = {
      id: uploaded.id,
      name: uploaded.name,
      webUrl: uploaded.webUrl,
      size: uploaded.size,
    };

    return NextResponse.json(
      { ok: true, message: "SharePoint wrapper çalışıyor.", steps },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, completedSteps: steps },
      { status: 500 }
    );
  }
}

// ============================================================================
// Mode 2 — Full sync test (Faz 4)
// ============================================================================

async function runFullSyncTest(requestId: string): Promise<NextResponse> {
  if (process.env.SHAREPOINT_SYNC_ENABLED !== "true") {
    return NextResponse.json(
      {
        ok: false,
        error: "SHAREPOINT_SYNC_ENABLED=true olmalı, aksi halde enqueue no-op.",
      },
      { status: 400 }
    );
  }

  const supabaseAdmin = createServiceRoleClient();

  // Terminal kapısı ön kontrolü: enqueue terminal olmayan statüleri sessizce
  // atlar — guard olmadan poll "pending"de takılır ve test eden nedenini göremez.
  const { data: reqRow } = await supabaseAdmin
    .from("requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();

  if (!reqRow) {
    return NextResponse.json(
      { ok: false, error: "Talep bulunamadı.", requestId },
      { status: 404 }
    );
  }
  if (!isArchivableStatus(reqRow.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Talep statüsü '${reqRow.status}' — arşivlenebilir değil. Yalnız terminal statüler (APPROVED/COMPLETED/REJECTED/CANCELLED) SharePoint'e gider.`,
        requestId,
      },
      { status: 400 }
    );
  }

  try {
    const pdfPath = await buildAndUploadRequestPDF({
      requestId,
      supabase: supabaseAdmin,
      persistPdfPath: true,
    });

    // Fire-and-forget upload arka planda devam ediyor; sync sonucu için
    // kısa bir polling yapalım ki test edenin sonucu görebilsin.
    const syncResult = await pollSyncResult(requestId, 15_000);

    return NextResponse.json({
      ok: true,
      mode: "full-sync",
      requestId,
      supabasePdfPath: pdfPath,
      sharepointSync: syncResult,
      note:
        syncResult.status === "pending"
          ? "Sync hâlâ devam ediyor olabilir; birkaç saniye sonra requests tablosundaki sharepoint_* alanlarını kontrol et."
          : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, mode: "full-sync", requestId },
      { status: 500 }
    );
  }
}

async function pollSyncResult(
  requestId: string,
  maxMs: number
): Promise<{
  status: "success" | "failed" | "pending";
  webUrl?: string;
  path?: string;
  error?: string;
}> {
  const supabaseAdmin = createServiceRoleClient();
  const start = Date.now();
  const intervalMs = 1000;

  while (Date.now() - start < maxMs) {
    const { data } = await supabaseAdmin
      .from("requests")
      .select(
        "sharepoint_sync_status, sharepoint_path, sharepoint_web_url, sharepoint_last_error"
      )
      .eq("id", requestId)
      .single();

    if (data?.sharepoint_sync_status === "success") {
      return {
        status: "success",
        path: data.sharepoint_path,
        webUrl: data.sharepoint_web_url,
      };
    }
    if (data?.sharepoint_sync_status === "failed") {
      return { status: "failed", error: data.sharepoint_last_error };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { status: "pending" };
}
