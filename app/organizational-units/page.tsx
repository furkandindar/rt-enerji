import { createClient } from "@/lib/supabase/server";
import { OrganizationalUnitSheet } from "./_components/organizational-unit-sheet";
import { OrganizationalUnitsTable } from "./_components/organizational-units-table";

export default async function OrganizationalUnitsPage() {
  const supabase = await createClient();

  // Fetch all organizational units first
  const { data: allUnits, error: unitsError } = await supabase
    .from("organizational_units")
    .select("*")
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });

  // Fetch all unit types
  const { data: unitTypes, error: typesError } = await supabase
    .from("unit_types")
    .select("id, name, code");

  const error = unitsError || typesError;

  // Manually join the data
  const organizationalUnits = allUnits?.map((unit) => {
    const unit_type = unitTypes?.find((type) => type.id === unit.unit_type_id) || null;
    const parent = allUnits?.find((u) => u.id === unit.parent_id) || null;

    return {
      ...unit,
      unit_type,
      parent: parent ? { id: parent.id, name: parent.name, code: parent.code } : null,
    };
  });

  if (error) {
    console.error("Error fetching organizational units:", error);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organizasyon Birimleri</h1>
        <OrganizationalUnitSheet mode="create" />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Veriler yüklenirken bir hata oluştu.
          </p>
        </div>
      ) : !organizationalUnits || organizationalUnits.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Henüz organizasyon birimi eklenmemiş.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <OrganizationalUnitsTable organizationalUnits={organizationalUnits} />
        </div>
      )}
    </div>
  );
}

