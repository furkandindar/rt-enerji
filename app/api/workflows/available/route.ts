import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAvailableWorkflows } from "@/lib/workflow";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// GET /api/workflows/available - Kullanıcının başlatabileceği workflow'ları getir
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Kullanıcı kontrolü
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Employee ID ve role'ü al
    const appUser = await getUserAccess(supabase);

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    // 3. Kullanıcının başlatabileceği workflow'ları getir (workflows.start_any tümünü görür)
    const workflows = await getAvailableWorkflows(supabase, appUser.employee_id, can(appUser, "workflows.start_any"));

    return NextResponse.json(workflows);
  } catch (error) {
    console.error("Error fetching available workflows:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}

