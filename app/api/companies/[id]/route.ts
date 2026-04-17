import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/companies/[id] - Get single company
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching company:", error);
      return NextResponse.json(
        { error: "Company not found" },
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

// PATCH /api/companies/[id] - Update company
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
    if (body.display_order !== undefined) {
      updateData.display_order = body.display_order;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    const { data, error } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating company:", error);

      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A company with this code already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update company" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Company not found" },
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
