import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  // Fetch all positions
  const { data: allPositions, error: positionsError } = await supabase
    .from("positions")
    .select("*")
    .order("order_index", { ascending: true })
    .order("job_code", { ascending: true });

  // Fetch all grade levels
  const { data: gradeLevels, error: gradeLevelsError } = await supabase
    .from("grade_levels")
    .select("band, name");

  // Fetch all organizational units
  const { data: organizationalUnits, error: unitsError } = await supabase
    .from("organizational_units")
    .select("id, name, code");

  // Fetch all position types
  const { data: positionTypes, error: typesError } = await supabase
    .from("position_types")
    .select("id, name, code, color");

  const error = positionsError || gradeLevelsError || unitsError || typesError;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Manually join the data
  const positions = allPositions?.map((position) => {
    const grade_level = gradeLevels?.find((gl) => gl.band === position.level_band) || null;
    const organizational_unit = organizationalUnits?.find((u) => u.id === position.unit_id) || null;
    const position_type = positionTypes?.find((pt) => pt.id === position.position_type_id) || null;
    const reports_to = allPositions?.find((p) => p.id === position.reports_to_position_id) || null;

    return {
      ...position,
      grade_level,
      organizational_unit,
      position_type,
      reports_to: reports_to ? { id: reports_to.id, title: reports_to.title, job_code: reports_to.job_code } : null,
    };
  });

  return NextResponse.json({ data: positions });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: newPosition, error } = await supabase
    .from("positions")
    .insert({
      title: body.title,
      job_code: body.job_code?.toUpperCase() || null,
      level_band: body.level_band,
      unit_id: body.unit_id,
      position_type_id: body.position_type_id || null,
      reports_to_position_id: body.reports_to_position_id || null,
      location: body.location || null,
      is_unit_head: body.is_unit_head ?? false,
      is_active: body.is_active ?? true,
      order_index: body.order_index ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch related data for the response
  const { data: gradeLevel } = await supabase
    .from("grade_levels")
    .select("band, name")
    .eq("band", newPosition.level_band)
    .single();

  const { data: organizationalUnit } = await supabase
    .from("organizational_units")
    .select("id, name, code")
    .eq("id", newPosition.unit_id)
    .single();

  let positionType = null;
  if (newPosition.position_type_id) {
    const { data: pt } = await supabase
      .from("position_types")
      .select("id, name, code, color")
      .eq("id", newPosition.position_type_id)
      .single();
    positionType = pt;
  }

  let reportsTo = null;
  if (newPosition.reports_to_position_id) {
    const { data: rt } = await supabase
      .from("positions")
      .select("id, title, job_code")
      .eq("id", newPosition.reports_to_position_id)
      .single();
    reportsTo = rt;
  }

  const data = {
    ...newPosition,
    grade_level: gradeLevel,
    organizational_unit: organizationalUnit,
    position_type: positionType,
    reports_to: reportsTo,
  };

  return NextResponse.json({ data });
}

