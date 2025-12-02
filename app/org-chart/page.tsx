import { createClient } from "@/lib/supabase/server";
import { OrgChartTree } from "./_components/org-chart-tree";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string | null;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
  is_unit_head: boolean;
  unit_id: string;
  employees: Employee[];
}

interface UnitNode {
  id: string;
  name: string;
  code: string | null;
  unit_type: string | null;
  positions: Position[];
  children: UnitNode[];
}

export default async function OrgChartPage() {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [unitsRes, positionsRes, employeesRes, assignmentsRes, unitTypesRes] = await Promise.all([
    supabase.from("organizational_units").select("*").eq("is_active", true).order("order_index"),
    supabase.from("positions").select("*").eq("is_active", true).order("order_index"),
    supabase.from("employees").select("*").eq("status", "ACTIVE"),
    supabase.from("employee_positions").select("*").is("end_date", null),
    supabase.from("unit_types").select("*"),
  ]);

  if (unitsRes.error || positionsRes.error || employeesRes.error || assignmentsRes.error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Veri yüklenirken hata oluştu</p>
      </div>
    );
  }

  const units = unitsRes.data || [];
  const positions = positionsRes.data || [];
  const employees = employeesRes.data || [];
  const assignments = assignmentsRes.data || [];
  const unitTypes = unitTypesRes.data || [];

  // 1. Map employees to positions
  const positionEmployeeMap = new Map<string, Employee[]>();
  assignments.forEach((a) => {
    const emp = employees.find((e) => e.id === a.employee_id);
    if (emp) {
      const existing = positionEmployeeMap.get(a.position_id) || [];
      existing.push(emp);
      positionEmployeeMap.set(a.position_id, existing);
    }
  });

  // 2. Map positions to units
  const unitPositionMap = new Map<string, Position[]>();
  positions.forEach((p) => {
    const posWithEmp: Position = { ...p, employees: positionEmployeeMap.get(p.id) || [] };
    const existing = unitPositionMap.get(p.unit_id) || [];
    existing.push(posWithEmp);
    unitPositionMap.set(p.unit_id, existing);
  });

  // 3. Build unit hierarchy
  const buildTree = (parentId: string | null): UnitNode[] => {
    return units
      .filter((u) => u.parent_id === parentId)
      .map((u) => {
        const unitType = unitTypes.find((ut) => ut.id === u.unit_type_id);
        return {
          id: u.id,
          name: u.name,
          code: u.code,
          unit_type: unitType?.name || null,
          positions: unitPositionMap.get(u.id) || [],
          children: buildTree(u.id),
        };
      });
  };

  const tree = buildTree(null);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organizasyon Şeması</h1>
        <p className="text-muted-foreground">
          Şirket organizasyon yapısını görüntüleyin
        </p>
      </div>

      <div className="rounded-md border bg-muted/20 min-h-[500px]">
        <OrgChartTree data={tree} />
      </div>
    </div>
  );
}

