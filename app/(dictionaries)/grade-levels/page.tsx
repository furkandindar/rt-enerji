import { createClient } from "@/lib/supabase/server";
import { GradeLevelSheet } from "./_components/grade-level-sheet";
import { GradeLevelsTable } from "./_components/grade-levels-table";

export default async function GradeLevelsPage() {
  const supabase = await createClient();

  const { data: gradeLevels, error } = await supabase
    .from("grade_levels")
    .select("*")
    .order("display_order", { ascending: true })
    .order("band", { ascending: true });

  if (error) {
    console.error("Error fetching grade levels:", error);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seviye Tipleri</h1>
        <GradeLevelSheet mode="create" />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Veriler yüklenirken bir hata oluştu.
          </p>
        </div>
      ) : !gradeLevels || gradeLevels.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Henüz seviye bandı eklenmemiş.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <GradeLevelsTable gradeLevels={gradeLevels} />
        </div>
      )}
    </div>
  );
}

