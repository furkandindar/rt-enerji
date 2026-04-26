// Microsoft Graph (Delegated) OAuth token storage
// Sadece server-side: service_role ile public.user_ms_tokens üzerinde CRUD yapar.
// Client bundle'a sızmaması için bu modülü yalnızca API route / server action / server
// component'lardan import edin.

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// ============================================================================
// Types
// ============================================================================

export interface MsTokenRecord {
  user_id: string;
  access_token: string;
  access_token_expires_at: string; // ISO timestamp
  refresh_token: string;
  scope: string | null;
  provider_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MsTokenUpsertInput {
  user_id: string;
  access_token: string;
  access_token_expires_at: string; // ISO timestamp (UTC)
  refresh_token: string;
  scope?: string | null;
  provider_user_id?: string | null;
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Kullanıcının Microsoft token kaydını getirir. Yoksa null döner.
 */
export async function getMsToken(userId: string): Promise<MsTokenRecord | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("user_ms_tokens")
    .select(
      "user_id, access_token, access_token_expires_at, refresh_token, scope, provider_user_id, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`[MsTokenStore] getMsToken failed: ${error.message}`);
  }

  return (data as MsTokenRecord | null) ?? null;
}

/**
 * Token kaydını oluşturur veya günceller (user_id üzerinden upsert).
 * Login callback ve refresh flow bu fonksiyonu çağırır.
 */
export async function upsertMsToken(input: MsTokenUpsertInput): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("user_ms_tokens").upsert(
    {
      user_id: input.user_id,
      access_token: input.access_token,
      access_token_expires_at: input.access_token_expires_at,
      refresh_token: input.refresh_token,
      scope: input.scope ?? null,
      provider_user_id: input.provider_user_id ?? null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`[MsTokenStore] upsertMsToken failed: ${error.message}`);
  }
}

/**
 * Kullanıcının token kaydını siler.
 * Logout veya refresh_token invalid_grant alırsak çağrılır.
 */
export async function deleteMsToken(userId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("user_ms_tokens")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`[MsTokenStore] deleteMsToken failed: ${error.message}`);
  }
}
