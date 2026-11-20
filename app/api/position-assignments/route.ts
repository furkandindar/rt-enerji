import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
	const supabase = await createClient();

  // Fetch all position assignments
  const { data: assignments, error: assignmentsError } = await supabase
    .from("employee_positions")
    .select("*")
    .order("created_at", { ascending: false });

  // Fetch all employees (sistem hesabı — gizli Süper Admin — ve atamaları listelenmez)
  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, employee_no")
    .eq("is_system", false);

  // Fetch all positions
  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("id, title, job_code");

  const error = assignmentsError || employeesError || positionsError;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Manually join the data
  const visibleEmployeeIds = new Set((employees ?? []).map((e) => e.id));
  const data = assignments
    ?.filter((assignment) => visibleEmployeeIds.has(assignment.employee_id))
    .map((assignment) => {
    const employee = employees?.find((e) => e.id === assignment.employee_id) || null;
    const position = positions?.find((p) => p.id === assignment.position_id) || null;

    return {
      ...assignment,
      employee,
      position,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: newAssignment, error } = await supabase
    .from("employee_positions")
    .insert({
      employee_id: body.employee_id,
      position_id: body.position_id,
      start_date: body.start_date,
      end_date: body.end_date || null,
      is_primary: body.is_primary ?? true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data for the response
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, employee_no");

  const { data: positions } = await supabase
    .from("positions")
    .select("id, title, job_code");

  const employee = employees?.find((e) => e.id === newAssignment.employee_id) || null;
  const position = positions?.find((p) => p.id === newAssignment.position_id) || null;

  return NextResponse.json({
    data: {
      ...newAssignment,
      employee,
      position,
    },
  });
}

