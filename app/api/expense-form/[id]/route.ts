import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateExpenseFormInput } from "@/lib/workflow";

// PATCH /api/expense-form/[id] — Harcama formu detayını ve items'ı günceller.
// items array gelirse delete + reinsert ile tüm satırlar değiştirilir.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateExpenseFormInput> = await request.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id, role")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return NextResponse.json({ error: "User not linked to employee" }, { status: 400 });
    }

    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Detail row'unu çek
    const { data: expense, error: expenseError } = await supabase
      .from("expense_requests")
      .select("id, is_travel")
      .eq("request_id", requestId)
      .single();

    if (expenseError || !expense) {
      return NextResponse.json({ error: "Expense detail not found" }, { status: 404 });
    }

    // Detail update
    const patch: Record<string, unknown> = {};
    const targetIsTravel = body.is_travel ?? expense.is_travel;
    if (body.request_date !== undefined) patch.request_date = body.request_date;
    if (body.project_name !== undefined) patch.project_name = body.project_name;
    if (body.project_code !== undefined) patch.project_code = body.project_code;
    if (body.is_travel !== undefined) patch.is_travel = body.is_travel;
    if (body.work_or_destination !== undefined) patch.work_or_destination = body.work_or_destination;
    if (body.travel_person_count !== undefined) {
      patch.travel_person_count = targetIsTravel ? (body.travel_person_count ?? null) : null;
    }
    if (body.travel_date !== undefined) {
      patch.travel_date = targetIsTravel ? (body.travel_date ?? null) : null;
    }
    if (body.travel_duration !== undefined) {
      patch.travel_duration = targetIsTravel ? (body.travel_duration ?? null) : null;
    }
    if (body.advance_amount !== undefined) patch.advance_amount = body.advance_amount ?? null;

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase
        .from("expense_requests")
        .update(patch)
        .eq("id", expense.id);

      if (updateError) {
        console.error("[expense-form PATCH] update failed:", updateError);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
    }

    // Items replace (delete + reinsert) — sadece body.items varsa
    if (Array.isArray(body.items)) {
      const { error: delError } = await supabase
        .from("expense_items")
        .delete()
        .eq("expense_request_id", expense.id);

      if (delError) {
        console.error("[expense-form PATCH] items delete failed:", delError);
        return NextResponse.json({ error: "Failed to clear items" }, { status: 500 });
      }

      if (body.items.length > 0) {
        const itemsData = body.items.map((it, idx) => ({
          expense_request_id: expense.id,
          row_order: idx + 1,
          item_date: it.item_date,
          document_no: it.document_no?.trim() ? it.document_no.trim() : null,
          description: it.description,
          amount: it.amount,
        }));

        const { error: insertError } = await supabase
          .from("expense_items")
          .insert(itemsData);

        if (insertError) {
          console.error("[expense-form PATCH] items insert failed:", insertError);
          return NextResponse.json({ error: "Failed to insert items" }, { status: 500 });
        }
      }
    }

    await applyAuditStamp(
      supabase,
      requestId,
      appUser.role === "ORG_ADMIN" && req.requester_employee_id !== appUser.employee_id
        ? "EDITED_BY_ADMIN"
        : "EDITED",
      appUser.employee_id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expense-form PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
