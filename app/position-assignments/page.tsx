import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PositionAssignmentsTable } from "./_components/position-assignments-table";
import { PositionAssignmentSheet } from "./_components/position-assignment-sheet";

export default async function PositionAssignmentsPage() {
  const supabase = await createClient();

  // Fetch all position assignments
  const { data: assignments, error: assignmentsError } = await supabase
    .from("employee_positions")
    .select("*")
    .order("created_at", { ascending: false });

  // Fetch all employees
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, employee_no");

  // Fetch all positions
  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("id, title, job_code");

  const error = assignmentsError || employeesError || positionsError;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Hata: {error.message}</p>
      </div>
    );
  }

  // Manually join the data
  const data = assignments?.map((assignment) => {
    const employee = employees?.find((e) => e.id === assignment.employee_id) || null;
    const position = positions?.find((p) => p.id === assignment.position_id) || null;

    return {
      ...assignment,
      employee,
      position,
    };
  });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pozisyon Atamaları</h1>
          <p className="text-muted-foreground">
            Çalışanların pozisyon atamalarını yönetin
          </p>
        </div>
        <PositionAssignmentSheet
          mode="create"
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Atama
            </Button>
          }
        />
      </div>

      <div className="rounded-md border">
        <PositionAssignmentsTable assignments={data || []} />
      </div>
    </div>
  );
}

