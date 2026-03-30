import { createClient } from "@/lib/supabase/server";
import { OrgChartFlow } from "./_components/org-chart-flow";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
  is_unit_head: boolean;
  unit_id: string;
  level_band: number | null;
  employees: Employee[];
  color: string | null;
  _sortOrder: number;
}

interface UnitData {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  unit_type: string | null;
  positions: Position[];
}

export default async function OrgChartPage() {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [unitsRes, positionsRes, employeesRes, assignmentsRes, unitTypesRes, positionTypesRes] = await Promise.all([
    supabase.from("organizational_units").select("*").eq("is_active", true).order("order_index"),
    supabase.from("positions").select("*").eq("is_active", true).order("order_index"),
    supabase.from("employees").select("*").eq("status", "ACTIVE"),
    supabase.from("employee_positions").select("*").is("end_date", null),
    supabase.from("unit_types").select("*"),
    supabase.from("position_types").select("id, color, display_order"),
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
  const positionTypes = positionTypesRes.data || [];

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

  // 2. Map positions to units (with color from position_types), sorted by hierarchy
  const unitPositionMap = new Map<string, Position[]>();
  positions.forEach((p) => {
    const positionType = positionTypes.find((pt) => pt.id === p.position_type_id);
    const posWithEmp: Position = {
      ...p,
      employees: positionEmployeeMap.get(p.id) || [],
      color: positionType?.color || null,
      _sortOrder: positionType?.display_order ?? 999,
    };
    const existing = unitPositionMap.get(p.unit_id) || [];
    existing.push(posWithEmp);
    unitPositionMap.set(p.unit_id, existing);
  });

  // Sort positions within each unit: position_type.display_order → level_band → job_code
  unitPositionMap.forEach((positions) => {
    positions.sort((a, b) => {
      const orderDiff = a._sortOrder - b._sortOrder;
      if (orderDiff !== 0) return orderDiff;
      const bandDiff = (a.level_band ?? 999) - (b.level_band ?? 999);
      if (bandDiff !== 0) return bandDiff;
      return (a.job_code || '').localeCompare(b.job_code || '');
    });
  });

  // 3. Build flat unit list with positions
  const unitsWithPositions: UnitData[] = units.map((u) => {
    const unitType = unitTypes.find((ut) => ut.id === u.unit_type_id);
    return {
      id: u.id,
      name: u.name,
      code: u.code,
      parent_id: u.parent_id,
      unit_type: unitType?.name || null,
      positions: unitPositionMap.get(u.id) || [],
    };
  });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 h-[calc(100vh-4rem)]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organizasyon Şeması</h1>
        <p className="text-muted-foreground">
          Şirket organizasyon yapısını görüntüleyin
        </p>
      </div>

      <div className="rounded-md border bg-background flex-1 min-h-[500px]">
        <OrgChartFlow units={unitsWithPositions} />
      </div>
    </div>
  );
}

