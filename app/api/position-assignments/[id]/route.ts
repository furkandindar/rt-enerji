import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const supabase = await createClient();
	const { id } = await params;

  const { data: assignment, error } = await supabase
    .from("employee_positions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: assignment });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await request.json();

  const { data: updatedAssignment, error } = await supabase
    .from("employee_positions")
    .update({
      employee_id: body.employee_id,
      position_id: body.position_id,
      start_date: body.start_date,
      end_date: body.end_date || null,
      is_primary: body.is_primary,
    })
    .eq("id", id)
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

  const employee = employees?.find((e) => e.id === updatedAssignment.employee_id) || null;
  const position = positions?.find((p) => p.id === updatedAssignment.position_id) || null;

  return NextResponse.json({
    data: {
      ...updatedAssignment,
      employee,
      position,
    },
  });
}

