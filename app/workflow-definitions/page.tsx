import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadWorkflowConfigOverview } from "@/lib/workflow/config-overview";
import { WorkflowConfigView } from "./_components/workflow-config-view";

// /workflow-definitions — ORG_ADMIN: süreç tanımları, adımlar ve onaycılar (salt okunur, Faz 1).
//
// Veri sunucuda derlenir (lib/workflow/config-overview.ts) ve istemciye hazır
// görünüm modeli olarak gider. Layout'taki AdminPageWrapper görsel guard'dır;
// konfigürasyon verisinin admin olmayanlara gitmemesi için rol burada da kontrol edilir.
export default async function WorkflowDefinitionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (appUser?.role !== "ORG_ADMIN") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground">Bu sayfa yalnızca yöneticilere açıktır.</p>
      </div>
    );
  }

  let overview;
  try {
    overview = await loadWorkflowConfigOverview(supabase);
  } catch (err) {
    console.error("[workflow-definitions] load failed:", err);
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-destructive">
          {err instanceof Error ? err.message : "Süreç tanımları yüklenemedi"}
        </p>
      </div>
    );
  }

  return <WorkflowConfigView overview={overview} />;
}
