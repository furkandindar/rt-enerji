import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { EmployeesTable } from "./_components/employees-table";
import { EmployeeSheet } from "./_components/employee-sheet";

export default async function EmployeesPage() {
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Hata: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Çalışanlar</h1>
          <p className="text-muted-foreground">
            Çalışanları yönetin
          </p>
        </div>
        <EmployeeSheet
          mode="create"
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Çalışan
            </Button>
          }
        />
      </div>

      <div className="rounded-md border">
        <EmployeesTable employees={employees || []} />
      </div>
    </div>
  );
}

