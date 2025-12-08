import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/position-types - Get all position types
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("position_types")
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching position types:", error);
      return NextResponse.json(
        { error: "Failed to fetch position types" },
        { status: 500 }
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

// POST /api/position-types - Create new position type
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("position_types")
      .insert({
        code: body.code.toUpperCase(),
        name: body.name,
        color: body.color || null,
        description: body.description || null,
        is_active: body.is_active ?? true,
        display_order: body.display_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating position type:", error);

      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A position type with this code already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create position type" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

