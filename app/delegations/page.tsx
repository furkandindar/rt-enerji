import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DelegationsAdmin } from "./_components/delegations-admin";

// /delegations — ORG_ADMIN: tüm vekaletler (Faz B / B3).
// Yetki son savunma hattı RLS + /api/delegations?scope=all (admin değilse kendi satırları).
export default async function DelegationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id, role")
    .eq("id", user.id)
    .single();

  if (appUser?.role !== "ORG_ADMIN") {
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
