import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canWithdrawRequest } from "@/lib/workflow";

// POST /api/requests/[id]/withdraw
// Talep eden, henüz hiçbir onay verilmemişse PENDING talebini DRAFT'a çeker.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

    // 1. Auth
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

    // 2. Talebi getir
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id, current_revision_cycle, current_step")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 3. Aktif cycle'daki approval kayıtlarını çek (workflow_step.approver_type ile)
    const { data: approvals } = await supabase
      .from("request_approvals")
      .select("status, workflow_step:workflow_steps(approver_type)")
      .eq("request_id", requestId)
      .eq("revision_cycle", req.current_revision_cycle ?? 0);

    // REQUESTER tipindeki adımlar (talep gönderme imzası) gerçek onay sayılmaz —
    // withdraw eligibility'sinde hariç tutulur.
    const realApprovals = (approvals ?? []).filter((a) => {
      const stepType = (a as unknown as { workflow_step?: { approver_type?: string } }).workflow_step?.approver_type;
      return stepType !== "REQUESTER";
    });

    // 4. Eligibility kontrolü
    const canWithdraw = canWithdrawRequest(
      { status: req.status, requester_employee_id: req.requester_employee_id },
      realApprovals,
      { employeeId: appUser.employee_id, role: appUser.role }
    );

    if (!canWithdraw) {
      return NextResponse.json(
        { error: "Cannot withdraw: request is no longer in withdrawable state" },
        { status: 409 }
      );
    }

    // 5. Yarış-safe UPDATE: eligibility'de okuduğumuz state (status=PENDING + aynı
    //    current_step) UPDATE anında hâlâ aynı olmalı. Bir onaycı kararını araya girip
    //    current_step ilerletmişse 0 satır etkilenir → 409.
    //    NOT: current_step=1 sabitlemiyoruz çünkü REQUESTER auto-approve adımları
    //    insert anında ileri taşıyabilir (createApprovalChain mantığı).
    const { data: updated, error: updateError } = await supabase
      .from("requests")
      .update({
        status: "DRAFT",
        submitted_at: null,
        current_step: 1,
      })
      .eq("id", requestId)
      .eq("status", "PENDING")
      .eq("current_step", req.current_step)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[withdraw] update failed:", updateError);
      return NextResponse.json({ error: "Failed to withdraw" }, { status: 500 });
    }

    if (!updated) {
      // 0 satır etkilendi → araya bir onay/iptal girmiş
      return NextResponse.json(
        { error: "Request state changed; withdraw aborted" },
        { status: 409 }
      );
    }

    // 6. Audit stamp
    await applyAuditStamp(supabase, requestId, "WITHDRAWN", appUser.employee_id);

    return NextResponse.json({ success: true, status: "DRAFT" });
  } catch (err) {
    console.error("[withdraw] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
