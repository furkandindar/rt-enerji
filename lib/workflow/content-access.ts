import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// İçerik kısıtlı süreçler (workflow_definitions.content_restricted — bugün İşe Giriş
// Onay ve İşten Çıkış Onay): talebin İÇERİĞİNİ (detay formu, ekler, PDF) yalnız
// talep sahibi, süreci başlatabilenler (workflow_initiators — İK) ve
// workflow_content_viewers (Genel Müdür) görür. Onay zinciri ve admin, talebi ve
// kendi onay adımını görür ama içeriği göremez — admin rolü içerik yetkisi vermez.
//
// Karar tek kaynaktan: DB public.can_view_request_content() (SECURITY INVOKER,
// kullanıcının oturumuyla çağrılır). Detay tabloları, ek kayıtları ve Storage PDF'i
// RLS ile de korunur; bu modül service role ile okuyan/sunan uçlar içindir.
// SQL: sql/feature_content_restricted_workflows.sql

export { RESTRICTED_CONTENT_MESSAGE } from "./content-access-shared";

export interface ContentAccess {
  restricted: boolean;
  canView: boolean;
}

/**
 * Talep içerik kısıtlı bir süreçteyse oturumdaki kullanıcının içeriği görüp
 * göremeyeceğini döner. Kısıtsız süreçlerde her zaman `canView: true` (bu modül
 * başka bir yetki kontrolünün yerini tutmaz). Hata durumunda kapalı kalır.
 *
 * @param userClient Kullanıcı oturumlu client (RPC auth.uid() okur).
 */
export async function getRequestContentAccess(
  userClient: SupabaseClient,
  requestId: string
): Promise<ContentAccess> {
  const { data: head, error: headError } = await createServiceRoleClient()
    .from("requests")
    .select("workflow_definition:workflow_definitions(content_restricted)")
    .eq("id", requestId)
    .maybeSingle();

  if (headError) {
    console.error("[content-access] restricted lookup failed:", headError);
    return { restricted: true, canView: false };
  }

  const wd = (head as { workflow_definition?: { content_restricted?: boolean } | { content_restricted?: boolean }[] | null } | null)
    ?.workflow_definition;
  const restricted = Array.isArray(wd) ? !!wd[0]?.content_restricted : !!wd?.content_restricted;
  if (!restricted) return { restricted: false, canView: true };

  const { data, error } = await userClient.rpc("can_view_request_content", {
    p_request_id: requestId,
  });
  if (error) {
    console.error("[content-access] can_view_request_content failed:", error);
    return { restricted: true, canView: false };
  }
  return { restricted: true, canView: data === true };
}

/**
 * Service role ile okunmuş talep nesnesinden içeriği çıkarır (yerinde değiştirir):
 * tipe özel detay ilişkisi, PDF/SharePoint yolları. UI `content_hidden` ile
 * içerik yerine bilgi notu gösterir ve PDF düğmelerini gizler.
 */
export function redactRequestContent(
  request: Record<string, unknown>,
  typeJoinKey: string | null
): void {
  if (typeJoinKey && typeJoinKey in request) request[typeJoinKey] = null;
  request.pdf_path = null;
  request.sharepoint_web_url = null;
  request.content_hidden = true;
}
