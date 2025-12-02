import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Fetch active employees
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, employee_no")
    .eq("status", "ACTIVE")
    .order("first_name", { ascending: true });

  // Fetch active positions
  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("id, title, job_code")
    .eq("is_active", true)
    .order("job_code", { ascending: true });

  const error = employeesError || positionsError;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    employees: employees || [],
    positions: positions || [],
  });
}

