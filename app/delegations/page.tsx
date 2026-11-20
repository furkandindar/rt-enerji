import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DelegationsAdmin } from "./_components/delegations-admin";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// /delegations — delegations.manage_all (Admin, Yönetici): tüm vekaletler (Faz B / B3).
// Yetki son savunma hattı RLS + /api/delegations?scope=all (izin yoksa kendi satırları).
export default async function DelegationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const appUser = await getUserAccess(supabase);

  if (!appUser || !can(appUser, "delegations.manage_all")) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-muted-foreground">
          Bu sayfa yöneticilere açıktır. Kendi vekaletlerinizi Profil sayfasından yönetebilirsiniz.
        </p>
      </div>
    );
  }

  if (!appUser.employee_id) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-destructive">Çalışan bilgisi bulunamadı</p>
      </div>
    );
  }

  return <DelegationsAdmin viewerEmployeeId={appUser.employee_id} />;
}
