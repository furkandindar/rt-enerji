import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/organizational-units/options - Get active unit types and organizational units for dropdowns
export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch active unit types
    const { data: unitTypes, error: unitTypesError } = await supabase
      .from("unit_types")
      .select("id, name, code")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (unitTypesError) {
      console.error("Error fetching unit types:", unitTypesError);
      return NextResponse.json(
        { error: "Failed to fetch unit types" },
        { status: 500 }
      );
    }

    // Fetch active organizational units (for parent selection)
    const { data: organizationalUnits, error: orgUnitsError } = await supabase
      .from("organizational_units")
      .select("id, name, code")
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });

    if (orgUnitsError) {
      console.error("Error fetching organizational units:", orgUnitsError);
      return NextResponse.json(
        { error: "Failed to fetch organizational units" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      unitTypes: unitTypes || [],
      organizationalUnits: organizationalUnits || [],
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

