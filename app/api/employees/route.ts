import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: employees });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: newEmployee, error } = await supabase
    .from("employees")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      employee_no: body.employee_no || null,
      email: body.email || null,
      phone: body.phone || null,
      status: body.status || "ACTIVE",
      hire_date: body.hire_date || null,
      termination_date: body.termination_date || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: newEmployee });
}

