import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const supabase = await createClient();
	const { id } = await params;

  const { data: employee, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: employee });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await request.json();

  const { data: updatedEmployee, error } = await supabase
    .from("employees")
    .update({
      first_name: body.first_name,
      last_name: body.last_name,
      employee_no: body.employee_no || null,
      email: body.email || null,
      phone: body.phone || null,
      status: body.status,
      hire_date: body.hire_date || null,
      termination_date: body.termination_date || null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: updatedEmployee });
}

