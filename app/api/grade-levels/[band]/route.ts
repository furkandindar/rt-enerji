import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/grade-levels/[band] - Get single grade level
export async function GET(
  request: Request,
  { params }: { params: Promise<{ band: string }> }
) {
  try {
    const supabase = await createClient();
    const { band } = await params;

    const { data, error } = await supabase
      .from("grade_levels")
      .select("*")
      .eq("band", parseInt(band))
      .single();

    if (error) {
      console.error("Error fetching grade level:", error);
      return NextResponse.json(
        { error: "Grade level not found" },
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

// PATCH /api/grade-levels/[band] - Update grade level
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ band: string }> }
) {
  try {
    const supabase = await createClient();
    const { band } = await params;
    const body = await request.json();

    // Build update object (only include provided fields)
    const updateData: Record<string, any> = {};

    if (body.band !== undefined) {
      updateData.band = body.band;
    }
    if (body.name !== undefined) {
      updateData.name = body.name;
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
      .from("grade_levels")
      .update(updateData)
      .eq("band", parseInt(band))
      .select()
      .single();

    if (error) {
      console.error("Error updating grade level:", error);

      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A grade level with this band already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update grade level" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Grade level not found" },
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

