import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/position-types/[id] - Get single position type
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("position_types")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching position type:", error);
      return NextResponse.json(
        { error: "Position type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/position-types/[id] - Update position type
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
      updateData.code = body.code.toUpperCase();
    }
    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.color !== undefined) {
      updateData.color = body.color || null;
    }
    if (body.description !== undefined) {
      updateData.description = body.description || null;
    }
    if (body.display_order !== undefined) {
      updateData.display_order = body.display_order;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    const { data, error } = await supabase
      .from("position_types")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating position type:", error);

      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A position type with this code already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update position type" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Position type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

