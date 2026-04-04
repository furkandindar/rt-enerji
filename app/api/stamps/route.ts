import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/stamps - Aktif kaşeleri listele
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("stamps")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching stamps:", error);
      return NextResponse.json(
        { error: "Failed to fetch stamps" },
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

