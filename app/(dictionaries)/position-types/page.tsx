import { createClient } from "@/lib/supabase/server";
import { PositionTypeSheet } from "./_components/position-type-sheet";
import { PositionTypesTable } from "./_components/position-types-table";

export default async function PositionTypesPage() {
  const supabase = await createClient();

  const { data: positionTypes, error } = await supabase
    .from("position_types")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching position types:", error);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pozisyon Tipleri</h1>
        <PositionTypeSheet mode="create" />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Veriler yüklenirken bir hata oluştu.
          </p>
        </div>
      ) : !positionTypes || positionTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Henüz pozisyon tipi eklenmemiş.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <PositionTypesTable positionTypes={positionTypes} />
        </div>
      )}
    </div>
  );
}

