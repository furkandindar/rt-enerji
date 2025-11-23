import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Fetch grade levels
  const { data: gradeLevels } = await supabase
    .from("grade_levels")
    .select("band, name")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("band", { ascending: true });

  // Fetch organizational units
  const { data: organizationalUnits } = await supabase
    .from("organizational_units")
    .select("id, name, code")
    .eq("is_active", true)
    .order("order_index", { ascending: true })
    .order("name", { ascending: true });

  // Fetch position types
  const { data: positionTypes } = await supabase
    .from("position_types")
    .select("id, name, code, color")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  // Fetch positions (for reports_to dropdown)
  const { data: positions } = await supabase
    .from("positions")
    .select("id, title, job_code")
    .eq("is_active", true)
    .order("job_code", { ascending: true });

  return NextResponse.json({
    gradeLevels: gradeLevels || [],
    organizationalUnits: organizationalUnits || [],
    positionTypes: positionTypes || [],
    positions: positions || [],
  });
}

