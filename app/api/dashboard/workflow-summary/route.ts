import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { APPROVAL_LIST_SELECT } from "@/lib/approvals/server-selects";
import { MY_REQUESTS_LIST_SELECT } from "@/lib/my-requests/server-selects";
import type { PendingApproval } from "@/lib/approvals/types";
import type {
  DashboardRecentRequest,
  DashboardSummary,
} from "@/lib/dashboard/types";

const PENDING_PREVIEW_LIMIT = 4;
const RECENT_REQUESTS_LIMIT = 3;

// GET /api/dashboard/workflow-summary - Ana sayfa özeti
//
// Tek istekte iki kartın verisi:
//   - Bekleyen onaylar: Bekleyen Onaylar sayfasıyla aynı kaynak ve sıra
//     (v_user_pending_approvals, queued_at asc) → toplam + ilk birkaç kayıt.
//     Vekaleten düşen satırlar da dahil (Faz B).
//   - Taleplerim: statü gruplarına göre sayılar + son hareket gören talepler.
//
// Sayılar head/count sorgularıyla alınır — tüm talepleri çekip saymak
// PostgREST satır limitinde (1000) sessizce yanlış sonuç verirdi.
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

    const employeeId = appUser.employee_id;

    const countByStatus = (statuses: string[]) =>
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("requester_employee_id", employeeId)
        .in("status", statuses);

    const [
      pendingIdsResult,
      recentResult,
      inProgressResult,
      revisionResult,
      approvedResult,
      rejectedResult,
    ] = await Promise.all([
      supabase
        .from("v_user_pending_approvals")
        .select("id, queued_at", { count: "exact" })
        .order("queued_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PENDING_PREVIEW_LIMIT),
      supabase
        .from("requests")
        .select(MY_REQUESTS_LIST_SELECT)
        .eq("requester_employee_id", employeeId)
        .order("updated_at", { ascending: false })
        .limit(RECENT_REQUESTS_LIMIT),
      countByStatus(["PENDING", "AWAITING_COMPLETION"]),
      countByStatus(["REVISION_REQUESTED"]),
      countByStatus(["APPROVED", "COMPLETED"]),
      countByStatus(["REJECTED"]),
    ]);

    if (pendingIdsResult.error || recentResult.error) {
      console.error(
        "[dashboard/workflow-summary] query error:",
        pendingIdsResult.error ?? recentResult.error
      );
      return NextResponse.json({ error: "Failed to fetch dashboard summary" }, { status: 500 });
    }

    // Bekleyen onayların liste satırları (Bekleyen Onaylar uç noktasıyla aynı
    // iki aşamalı desen: view'dan id seti, sonra hafif liste select'i).
    const idRows = pendingIdsResult.data ?? [];
    const ids = idRows.map((r) => r.id as string);
    let pendingItems: PendingApproval[] = [];

    if (ids.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("request_approvals")
        .select(APPROVAL_LIST_SELECT)
        .in("id", ids);

      if (itemsError) {
        console.error("[dashboard/workflow-summary] pending items error:", itemsError);
        return NextResponse.json({ error: "Failed to fetch dashboard summary" }, { status: 500 });
      }

      // .in() sıra korumaz → view sırasını geri kur, queued_at'i ekle.
      const queuedAtById = new Map(
        idRows.map((r) => [r.id as string, r.queued_at as string | null])
      );
      const rank = new Map(ids.map((id, i) => [id, i]));
      pendingItems = ((items ?? []) as unknown as PendingApproval[])
        .map((item) => ({ ...item, queued_at: queuedAtById.get(item.id) ?? null }))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }

    const summary: DashboardSummary = {
      viewerEmployeeId: employeeId,
      pendingApprovals: {
        total: pendingIdsResult.count ?? 0,
        items: pendingItems,
      },
      myRequests: {
        counts: {
          inProgress: inProgressResult.count ?? 0,
          revision: revisionResult.count ?? 0,
          approved: approvedResult.count ?? 0,
          rejected: rejectedResult.count ?? 0,
        },
        recent: (recentResult.data ?? []) as unknown as DashboardRecentRequest[],
      },
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
