import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SignatureManager } from "./_components/signature-manager";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignatureFont } from "@/lib/signature/types";

export default async function ProfilePage() {
  const supabase = await createClient();

  // Kullanıcı bilgilerini al
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Employee bilgilerini al
  const { data: appUser } = await supabase
    .from("app_users")
    .select(`
      employee_id,
      employee:employees(
        id,
        first_name,
        last_name,
        employee_no,
        email,
        phone,
        signature_text,
        signature_font
      )
    `)
    .eq("id", user.id)
    .single();

  if (!appUser?.employee) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Çalışan bilgisi bulunamadı</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employeeData = appUser.employee as any;
  const employee = {
    id: employeeData.id as string,
    first_name: employeeData.first_name as string,
    last_name: employeeData.last_name as string,
    employee_no: employeeData.employee_no as string | null,
    email: employeeData.email as string | null,
    phone: employeeData.phone as string | null,
    signature_text: employeeData.signature_text as string | null,
    signature_font: employeeData.signature_font as SignatureFont | null,
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profilim</h1>
        <p className="text-muted-foreground">
          Kişisel bilgilerinizi ve imzanızı yönetin
        </p>
      </div>

      {/* Kişisel Bilgiler */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Kişisel Bilgiler</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Ad Soyad</p>
            <p className="text-sm font-semibold">
              {employee.first_name} {employee.last_name}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Sicil No</p>
            <p className="text-sm font-semibold">{employee.employee_no || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">E-posta</p>
            <p className="text-sm font-semibold">{employee.email || user.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Telefon</p>
            <p className="text-sm font-semibold">{employee.phone || "-"}</p>
          </div>
        </div>
      </div>

      {/* İmza Yönetimi */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Dijital İmza</h2>
        <p className="text-sm text-muted-foreground mb-6">
          İmzanız onayladığınız taleplerin PDF belgelerinde görünecektir.
        </p>
        <SignatureManager
          employeeId={employee.id}
          firstName={employee.first_name}
          lastName={employee.last_name}
          currentSignatureText={employee.signature_text}
          currentSignatureFont={employee.signature_font}
        />
      </div>

      {/* Tema Tercihi */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Tema</h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Arayüz temasını seçin (Açık, Koyu veya Sistem).
          </p>
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );
}

