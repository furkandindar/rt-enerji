import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listApproverCandidates } from "@/lib/workflow/extra-approvers";

// GET /api/approver-candidates
// Ek onaycı seçicisinin aday listesi: aktif (employees.status = ACTIVE) VE sistem
// hesabı bağlı (app_users.employee_id) çalışanlar + güncel pozisyon başlığı.
// Hesabı olmayan/pasif kişi seçilirse zincir o adımda kilitlenirdi.
//
// service role: app_users başka kullanıcılara RLS ile kapalı. Dönen alanlar
// (ad, sicil no, pozisyon) zaten tüm kullanıcılara açık çalışan bilgisidir.
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    const candidates = await listApproverCandidates(createServiceRoleClient());
    return NextResponse.json(candidates);
  } catch (err) {
    console.error("[approver-candidates] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
