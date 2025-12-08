import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: position, error: positionError } = await supabase
    .from("positions")
    .select("*")
    .eq("id", id)
    .single();

  if (positionError) {
    return NextResponse.json({ error: positionError.message }, { status: 500 });
  }

  // Fetch related data
  const { data: gradeLevel } = await supabase
    .from("grade_levels")
    .select("band, name")
    .eq("band", position.level_band)
    .single();

  const { data: organizationalUnit } = await supabase
    .from("organizational_units")
    .select("id, name, code")
    .eq("id", position.unit_id)
    .single();

  let positionType = null;
  if (position.position_type_id) {
    const { data: pt } = await supabase
      .from("position_types")
      .select("id, name, code, color")
      .eq("id", position.position_type_id)
      .single();
    positionType = pt;
  }

  let reportsTo = null;
  if (position.reports_to_position_id) {
    const { data: rt } = await supabase
      .from("positions")
      .select("id, title, job_code")
      .eq("id", position.reports_to_position_id)
      .single();
    reportsTo = rt;
  }

  const data = {
    ...position,
    grade_level: gradeLevel,
    organizational_unit: organizationalUnit,
    position_type: positionType,
    reports_to: reportsTo,
  };

  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await request.json();

  const { data: updatedPosition, error } = await supabase
    .from("positions")
    .update({
      title: body.title,
      job_code: body.job_code?.toUpperCase() || null,
      level_band: body.level_band,
      unit_id: body.unit_id,
      position_type_id: body.position_type_id || null,
      reports_to_position_id: body.reports_to_position_id || null,
      location: body.location || null,
      is_unit_head: body.is_unit_head ?? false,
      is_active: body.is_active,
      order_index: body.order_index,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data for the response
  const { data: gradeLevel } = await supabase
    .from("grade_levels")
    .select("band, name")
    .eq("band", updatedPosition.level_band)
    .single();

  const { data: organizationalUnit } = await supabase
    .from("organizational_units")
    .select("id, name, code")
    .eq("id", updatedPosition.unit_id)
    .single();

  let positionType = null;
  if (updatedPosition.position_type_id) {
    const { data: pt } = await supabase
      .from("position_types")
      .select("id, name, code, color")
      .eq("id", updatedPosition.position_type_id)
      .single();
    positionType = pt;
  }

  let reportsTo = null;
  if (updatedPosition.reports_to_position_id) {
    const { data: rt } = await supabase
      .from("positions")
      .select("id, title, job_code")
      .eq("id", updatedPosition.reports_to_position_id)
      .single();
    reportsTo = rt;
  }

  const data = {
    ...updatedPosition,
    grade_level: gradeLevel,
    organizational_unit: organizationalUnit,
    position_type: positionType,
    reports_to: reportsTo,
  };

  return NextResponse.json({ data });
}

