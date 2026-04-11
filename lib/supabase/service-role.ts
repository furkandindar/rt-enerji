import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service role client - RLS bypass eder
 * SADECE güvenilir server-side işlemler için kullanın!
 * Örnek: PDF oluşturma, otomatik işlemler, admin işlemleri
 */
export function createServiceRoleClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
