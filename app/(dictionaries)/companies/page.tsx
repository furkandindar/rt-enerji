import { createClient } from "@/lib/supabase/server";
import { CompanySheet } from "./_components/company-sheet";
import { CompaniesTable } from "./_components/companies-table";

export default async function CompaniesPage() {
  const supabase = await createClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching companies:", error);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Şirketler</h1>
        <CompanySheet mode="create" />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Veriler yüklenirken bir hata oluştu.
          </p>
        </div>
      ) : !companies || companies.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Henüz şirket eklenmemiş.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <CompaniesTable companies={companies} />
        </div>
      )}
    </div>
  );
}
