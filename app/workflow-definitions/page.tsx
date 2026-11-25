import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadWorkflowConfigOverview } from "@/lib/workflow/config-overview";
import { WorkflowConfigView } from "./_components/workflow-config-view";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// /workflow-definitions — workflows.view (Admin, Yönetici, Bilgi İşlem Uzmanı): süreç tanımları, adımlar ve
// onaycılar. Salt okunur; tek istisna sabit pozisyonlu adımın pozisyonu — yalnız
// workflows.manage (Admin, Yönetici) (Faz 2a, PATCH /api/workflow-steps/[id]).
//
// Veri sunucuda derlenir (lib/workflow/config-overview.ts) ve istemciye hazır
// görünüm modeli olarak gider. Layout'taki AdminPageWrapper görsel guard'dır;
// konfigürasyon verisinin yetkisizlere gitmemesi için izin burada da kontrol edilir.
export default async function WorkflowDefinitionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const appUser = await getUserAccess(supabase);

  if (!appUser || !can(appUser, "workflows.view")) {
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

  return <WorkflowConfigView overview={overview} canEdit={can(appUser, "workflows.manage")} />;
}
