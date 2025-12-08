import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/unit-types - List all unit types
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("unit_types")
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching unit types:", error);
      return NextResponse.json(
        { error: "Failed to fetch unit types" },
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

// POST /api/unit-types - Create new unit type
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Validate required fields
    if (!body.code || !body.name) {
      return NextResponse.json(
        { error: "Code and name are required" },
        { status: 400 }
      );
    }

    // Convert code to uppercase
    const unitTypeData = {
      code: body.code.toUpperCase(),
      name: body.name,
      description: body.description || null,
      display_order: body.display_order ?? 0,
      is_active: body.is_active ?? true,
    };

    const { data, error } = await supabase
      .from("unit_types")
      .insert(unitTypeData)
      .select()
      .single();

    if (error) {
      console.error("Error creating unit type:", error);
      
      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A unit type with this code already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create unit type" },
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

