import { createClient } from "@/lib/supabase/server";
import { CreateUnitTypeSheet } from "./_components/create-unit-type-sheet";
import { UnitTypesTable } from "./_components/unit-types-table";

export default async function UnitTypesPage() {
  const supabase = await createClient();

  const { data: unitTypes, error } = await supabase
    .from("unit_types")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching unit types:", error);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Birim Tipleri</h1>
        <CreateUnitTypeSheet mode="create" />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Veriler yüklenirken bir hata oluştu.
          </p>
        </div>
      ) : !unitTypes || unitTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Henüz birim tipi eklenmemiş.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <UnitTypesTable unitTypes={unitTypes} />
        </div>
      )}
    </div>
  );
}

