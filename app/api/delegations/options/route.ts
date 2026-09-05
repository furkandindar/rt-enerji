import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { DELEGATION_ALLOWED_WORKFLOW_CODES } from "@/lib/workflow/delegation";

// GET /api/delegations/options — vekalet formu seçenekleri. Faz B / B2.
//   workflows: vekalete açık süreçler (karar 8: şimdilik tek)
//   employees: vekil adayları = ACTIVE + uygulama hesabı olan çalışanlar (kendisi hariç)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    const [{ data: workflows }, { data: linkedUsers }, { data: employees }] = await Promise.all([
      supabase
        .from("workflow_definitions")
        .select("id, code, name")
        .in("code", [...DELEGATION_ALLOWED_WORKFLOW_CODES])
        .eq("is_active", true)
        .order("name"),
      supabase.from("app_users").select("employee_id").not("employee_id", "is", null),
      supabase
        .from("employees")
        .select(`
          id,
          first_name,
          last_name,
          employee_positions(
            is_primary,
            end_date,
            position:positions(title)
          )
        `)
        .eq("status", "ACTIVE")
        .order("first_name")
        .order("last_name"),
    ]);

    const linked = new Set((linkedUsers ?? []).map((u) => u.employee_id as string));

    const candidates = (employees ?? [])
      .filter((e) => linked.has(e.id) && e.id !== appUser.employee_id)
      .map((e) => {
        const positions = (e.employee_positions ?? []) as Array<{
          is_primary: boolean;
          end_date: string | null;
          position: { title: string } | { title: string }[] | null;
        }>;
        const primary =
          positions.find((p) => p.is_primary && !p.end_date) ??
          positions.find((p) => !p.end_date) ??
          null;
        const pos = primary?.position;
        const title = Array.isArray(pos) ? pos[0]?.title : pos?.title;
        return {
          id: e.id,
          first_name: e.first_name,
          last_name: e.last_name,
          position_title: title ?? null,
        };
      });

    return NextResponse.json({
      workflows: workflows ?? [],
      employees: candidates,
      viewer_employee_id: appUser.employee_id,
      role: appUser.role,
    });
  } catch (err) {
    console.error("[delegations] options error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
