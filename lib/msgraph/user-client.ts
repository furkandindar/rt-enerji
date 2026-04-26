// Microsoft Graph — Delegated (per-user) client
// Server-only. Kullanıcının refresh_token'ı ile access_token yenilemesi yapar
// ve /me/... gibi delegated Graph çağrılarını çalıştırır.

import { deleteMsToken, getMsToken, upsertMsToken } from "./token-store";

// ============================================================================
// Config
// ============================================================================

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// ============================================================================
// Custom errors
// ============================================================================

/** Kullanıcı için hiç Microsoft token kaydı yok (henüz login olmadı / logout oldu). */
export class MsTokenNotFoundError extends Error {
  constructor(userId: string) {
    super(`[MsGraphUser] No Microsoft token for user ${userId}. Re-login required.`);
    this.name = "MsTokenNotFoundError";
  }
}

/** Refresh token invalid/expired (90 gün, parola değişikliği, admin revoke vb.). */
export class MsReconsentRequiredError extends Error {
  constructor(userId: string, reason?: string) {
    super(
      `[MsGraphUser] Refresh token invalid for user ${userId}. Re-consent required.${
        reason ? ` Reason: ${reason}` : ""
      }`
    );
    this.name = "MsReconsentRequiredError";
  }
}

// ============================================================================
// Refresh flow (per-user, in-memory dedup)
// ============================================================================

/** Aynı kullanıcı için paralel refresh isteklerini tek bir çağrıda toplayan map. */
const inflightRefresh = new Map<string, Promise<string>>();

function assertUserConfig(): void {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Microsoft Graph user-client config eksik: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET gerekli."
    );
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string; // Microsoft bazen döndürür (rotated), bazen eski refresh korunur
  expires_in: number;
  scope?: string;
  token_type: string;
}

async function refreshAccessToken(userId: string, currentRefreshToken: string): Promise<string> {
  assertUserConfig();

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // invalid_grant → refresh_token artık geçerli değil, kaydı sil ve üst katmanı bilgilendir
    if (response.status === 400 && errorText.includes("invalid_grant")) {
      await deleteMsToken(userId).catch(() => {});
      throw new MsReconsentRequiredError(userId, errorText);
    }
    throw new Error(`[MsGraphUser] Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;

  await upsertMsToken({
    user_id: userId,
    access_token: data.access_token,
    access_token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    refresh_token: data.refresh_token ?? currentRefreshToken,
    scope: data.scope ?? null,
  });

  return data.access_token;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Kullanıcının geçerli Graph access token'ını döndürür. Gerekirse sessizce refresh eder.
 * @throws MsTokenNotFoundError - Hiç token yoksa (re-login gerek)
 * @throws MsReconsentRequiredError - Refresh token geçersizse (re-consent gerek)
 */
export async function getUserAccessToken(userId: string): Promise<string> {
  const record = await getMsToken(userId);
  if (!record) {
    throw new MsTokenNotFoundError(userId);
  }

  const expiresAt = new Date(record.access_token_expires_at).getTime();
  // 60 sn güvenlik payı
  if (Date.now() < expiresAt - 60_000) {
    return record.access_token;
  }

  const existing = inflightRefresh.get(userId);
  if (existing) return existing;

  const promise = refreshAccessToken(userId, record.refresh_token).finally(() => {
    inflightRefresh.delete(userId);
  });
  inflightRefresh.set(userId, promise);
  return promise;
}

/**
 * Kullanıcının token'ıyla Graph çağrısı yapar. `path` "/me/calendar/events" gibi /v1.0 sonrası.
 */
export async function graphUserFetch(
  userId: string,
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {}
): Promise<Response> {
  const token = await getUserAccessToken(userId);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const body =
    init.body === undefined
      ? undefined
      : typeof init.body === "string" || init.body instanceof URLSearchParams
        ? (init.body as BodyInit)
        : JSON.stringify(init.body);

  return fetch(`${GRAPH_BASE_URL}${path}`, { ...init, headers, body });
}
