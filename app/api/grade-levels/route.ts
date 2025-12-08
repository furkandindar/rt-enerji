import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/grade-levels - Get all grade levels
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("grade_levels")
      .select("*")
      .order("display_order", { ascending: true })
      .order("band", { ascending: true });

    if (error) {
      console.error("Error fetching grade levels:", error);
      return NextResponse.json(
        { error: "Failed to fetch grade levels" },
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

// POST /api/grade-levels - Create new grade level
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("grade_levels")
      .insert({
        band: body.band,
        name: body.name,
        description: body.description || null,
        is_active: body.is_active ?? true,
        display_order: body.display_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating grade level:", error);

      // Check for unique constraint violation (band is primary key)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A grade level with this band already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create grade level" },
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

