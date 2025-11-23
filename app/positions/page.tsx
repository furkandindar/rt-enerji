import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PositionsTable } from "./_components/positions-table";
import { PositionSheet } from "./_components/position-sheet";

export default async function PositionsPage() {
  const supabase = await createClient();

  // Fetch all positions
  const { data: allPositions, error: positionsError } = await supabase
    .from("positions")
    .select("*")
    .order("order_index", { ascending: true })
    .order("job_code", { ascending: true });

  // Fetch all grade levels
  const { data: gradeLevels, error: gradeLevelsError } = await supabase
    .from("grade_levels")
    .select("band, name");

  // Fetch all organizational units
  const { data: organizationalUnits, error: unitsError } = await supabase
    .from("organizational_units")
    .select("id, name, code");

  // Fetch all position types
  const { data: positionTypes, error: typesError } = await supabase
    .from("position_types")
    .select("id, name, code, color");

  const error = positionsError || gradeLevelsError || unitsError || typesError;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Hata: {error.message}</p>
      </div>
    );
  }

  // Manually join the data
  const positions = allPositions?.map((position) => {
    const grade_level = gradeLevels?.find((gl) => gl.band === position.level_band) || null;
    const organizational_unit = organizationalUnits?.find((u) => u.id === position.unit_id) || null;
    const position_type = positionTypes?.find((pt) => pt.id === position.position_type_id) || null;
    const reports_to = allPositions?.find((p) => p.id === position.reports_to_position_id) || null;

    return {
      ...position,
      grade_level,
      organizational_unit,
      position_type,
      reports_to: reports_to ? { id: reports_to.id, title: reports_to.title, job_code: reports_to.job_code } : null,
    };
  }) || [];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pozisyonlar</h1>
          <p className="text-muted-foreground">
            Organizasyon pozisyonlarını yönetin
          </p>
        </div>
        <PositionSheet
          mode="create"
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Pozisyon
            </Button>
          }
        />
      </div>

      <div className="rounded-md border">
        <PositionsTable positions={positions} />
      </div>
    </div>
  );
}

