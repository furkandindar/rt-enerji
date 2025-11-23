import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/organizational-units - Get all organizational units with relations
export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all organizational units
    const { data: allUnits, error: unitsError } = await supabase
      .from("organizational_units")
      .select("*")
      .order("order_index", { ascending: true })
      .order("name", { ascending: true });

    // Fetch all unit types
    const { data: unitTypes, error: typesError } = await supabase
      .from("unit_types")
      .select("id, name, code");

    if (unitsError || typesError) {
      console.error("Error fetching data:", unitsError || typesError);
      return NextResponse.json(
        { error: "Failed to fetch organizational units" },
        { status: 500 }
      );
    }

    // Manually join the data
    const data = allUnits?.map((unit) => {
      const unit_type = unitTypes?.find((type) => type.id === unit.unit_type_id) || null;
      const parent = allUnits?.find((u) => u.id === unit.parent_id) || null;

      return {
        ...unit,
        unit_type,
        parent: parent ? { id: parent.id, name: parent.name, code: parent.code } : null,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/organizational-units - Create new organizational unit
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data: newUnit, error } = await supabase
      .from("organizational_units")
      .insert({
        code: body.code?.toUpperCase() || null,
        name: body.name,
        unit_type_id: body.unit_type_id,
        parent_id: body.parent_id || null,
        description: body.description || null,
        is_active: body.is_active ?? true,
        order_index: body.order_index ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating organizational unit:", error);

      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "An organizational unit with this code already exists" },
          { status: 409 }
        );
      }

      // Check for foreign key violation
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Invalid unit type or parent unit" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create organizational unit" },
        { status: 500 }
      );
    }

    // Fetch related data for the response
    const { data: unitType } = await supabase
      .from("unit_types")
      .select("id, name, code")
      .eq("id", newUnit.unit_type_id)
      .single();

    let parent = null;
    if (newUnit.parent_id) {
      const { data: parentData } = await supabase
        .from("organizational_units")
        .select("id, name, code")
        .eq("id", newUnit.parent_id)
        .single();
      parent = parentData;
    }

    const data = {
      ...newUnit,
      unit_type: unitType,
      parent,
    };

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

