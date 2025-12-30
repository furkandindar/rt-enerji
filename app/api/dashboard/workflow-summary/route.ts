import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/dashboard/workflow-summary - Kullanıcının workflow özeti
export async function GET() {
  try {
    const supabase = await createClient();

    // Mevcut kullanıcının employee_id'sini al
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

    // 1. Bekleyen onaylar sayısı (current_step'i kontrol et)
    const { data: pendingApprovals } = await supabase
      .from("request_approvals")
      .select(`
        id,
        workflow_step:workflow_steps(step_order),
        request:requests(current_step, status)
      `)
      .eq("approver_employee_id", appUser.employee_id)
      .eq("status", "PENDING");

    // Sadece sırası gelenleri say
    const activePendingCount = pendingApprovals?.filter(a => {
      // Supabase join sonuçları: tek relation tek obje, çoklu relation array döner
      const request = Array.isArray(a.request) ? a.request[0] : a.request;
      const step = Array.isArray(a.workflow_step) ? a.workflow_step[0] : a.workflow_step;
      return request && step &&
             request.status === 'PENDING' &&
             request.current_step === step.step_order;
    }).length || 0;

    // 2. Kullanıcının talepleri (status'a göre grupla)
    const { data: myRequests } = await supabase
      .from("requests")
      .select("status")
      .eq("requester_employee_id", appUser.employee_id);

    const requestCounts = {
      total: myRequests?.length || 0,
      pending: myRequests?.filter(r => r.status === 'PENDING').length || 0,
      approved: myRequests?.filter(r => r.status === 'APPROVED').length || 0,
      rejected: myRequests?.filter(r => r.status === 'REJECTED').length || 0,
    };

    // 3. Okunmamış bildirim sayısı
    const { count: unreadNotifications } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    // 4. Son aktiviteler (son 5 talep/onay)
    const { data: recentRequests } = await supabase
      .from("requests")
      .select(`
        id,
        status,
        created_at,
        workflow_definition:workflow_definitions(name)
      `)
      .eq("requester_employee_id", appUser.employee_id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      pendingApprovalsCount: activePendingCount,
      myRequests: requestCounts,
      unreadNotifications: unreadNotifications || 0,
      recentRequests: recentRequests || [],
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

