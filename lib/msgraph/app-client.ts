// Microsoft Graph — Application (Client Credentials) client
// Server-only. Uygulama kimliğiyle (kullanıcı bağlamı yok) Graph API çağırır.
// Şu an tek kullanıcısı email sistemi (Mail.Send). İleride başka app-level işler
// gerekirse buradan çağrılır.

// ============================================================================
// Config
// ============================================================================

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface AppConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Env değişkenlerini okuyup tip-güvenli AppConfig döndürür.
 * Eksik değişken varsa fırlatır; çağıran taraf string olarak güvenle kullanır.
 */
function getAppConfig(): AppConfig {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph app config eksik: AZURE_TENANT_ID, AZURE_CLIENT_ID ve AZURE_CLIENT_SECRET gerekli."
    );
  }

  return { tenantId, clientId, clientSecret };
}

// ============================================================================
// Token cache (in-memory, process-wide)
// ============================================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Client Credentials flow ile app-level access token alır.
 * Token'ı in-memory cache'ler, süresi dolmadan 60s kalaya kadar yeniden kullanır.
 */
export async function getAppAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const { tenantId, clientId, clientSecret } = getAppConfig();

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[MsGraphApp] Token alınamadı: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ============================================================================
// Graph fetch helper
// ============================================================================

/**
 * Graph API çağrısı yapar. `path` "/users/..." gibi /v1.0 sonrası kısım.
 * Authorization header otomatik eklenir. Content-Type JSON default; body obje
 * verirseniz JSON.stringify ile gönderilir.
 */
export async function graphAppFetch(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {}
): Promise<Response> {
  const token = await getAppAccessToken();

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

  return fetch(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers,
    body,
  });
}
