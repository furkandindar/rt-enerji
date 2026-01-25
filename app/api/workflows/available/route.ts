import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAvailableWorkflows } from "@/lib/workflow";

// GET /api/workflows/available - Kullanıcının başlatabileceği workflow'ları getir
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Kullanıcı kontrolü
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Employee ID'yi al
    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // 3. Kullanıcının başlatabileceği workflow'ları getir
    const workflows = await getAvailableWorkflows(supabase, appUser.employee_id);

    return NextResponse.json(workflows);
  } catch (error) {
    console.error("Error fetching available workflows:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}

