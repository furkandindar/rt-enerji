import { createClient } from "@/lib/supabase/server";
import { upsertMsToken } from "@/lib/msgraph/token-store";
import { NextResponse } from "next/server";

/** JWT payload'ından exp claim'ini ms cinsinden çıkarır. Graph access token JWT'dir. */
function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Microsoft provider token'larını yakala → user_ms_tokens'a upsert et.
      // Hata olursa login'i bloklamayız; sadece delegated Graph widget'ları çalışmaz.
      const session = data.session;
      const user = data.user;
      if (session?.provider_token && session?.provider_refresh_token && user) {
        try {
          const expMs =
            decodeJwtExpMs(session.provider_token) ?? Date.now() + 3600 * 1000;
          const providerUserId =
            (user.user_metadata?.provider_id as string | undefined) ??
            (user.user_metadata?.sub as string | undefined) ??
            null;
          await upsertMsToken({
            user_id: user.id,
            access_token: session.provider_token,
            access_token_expires_at: new Date(expMs).toISOString(),
            refresh_token: session.provider_refresh_token,
            provider_user_id: providerUserId,
          });
        } catch (e) {
          console.error("[AuthCallback] MS token persist failed:", e);
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

