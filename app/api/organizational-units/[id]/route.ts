import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/organizational-units/[id] - Get single organizational unit
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: unit, error } = await supabase
      .from("organizational_units")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching organizational unit:", error);
      return NextResponse.json(
        { error: "Organizational unit not found" },
        { status: 404 }
      );
    }

    // Fetch related data
    const { data: unitType } = await supabase
      .from("unit_types")
      .select("id, name, code")
      .eq("id", unit.unit_type_id)
      .single();

    let parent = null;
    if (unit.parent_id) {
      const { data: parentData } = await supabase
        .from("organizational_units")
        .select("id, name, code")
        .eq("id", unit.parent_id)
        .single();
      parent = parentData;
    }

    const data = {
      ...unit,
      unit_type: unitType,
      parent,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/organizational-units/[id] - Update organizational unit
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();

    // Build update object (only include provided fields)
    const updateData: Record<string, any> = {};

    if (body.code !== undefined) {
      updateData.code = body.code?.toUpperCase() || null;
    }
    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.unit_type_id !== undefined) {
      updateData.unit_type_id = body.unit_type_id;
    }
    if (body.parent_id !== undefined) {
      updateData.parent_id = body.parent_id || null;
    }
    if (body.description !== undefined) {
      updateData.description = body.description || null;
    }
    if (body.order_index !== undefined) {
      updateData.order_index = body.order_index;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    const { data: updatedUnit, error } = await supabase
      .from("organizational_units")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating organizational unit:", error);

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
        { error: "Failed to update organizational unit" },
        { status: 500 }
      );
    }

    if (!updatedUnit) {
      return NextResponse.json(
        { error: "Organizational unit not found" },
        { status: 404 }
      );
    }

    // Fetch related data
    const { data: unitType } = await supabase
      .from("unit_types")
      .select("id, name, code")
      .eq("id", updatedUnit.unit_type_id)
      .single();

    let parent = null;
    if (updatedUnit.parent_id) {
      const { data: parentData } = await supabase
        .from("organizational_units")
        .select("id, name, code")
        .eq("id", updatedUnit.parent_id)
        .single();
      parent = parentData;
    }

    const data = {
      ...updatedUnit,
      unit_type: unitType,
      parent,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

