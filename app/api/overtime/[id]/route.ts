import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type { CreateOvertimeInput } from "@/lib/workflow";

// PATCH /api/overtime/[id] — Fazla mesai talebi detayını ve entries'i günceller.
// STAFF_SHORTAGE durumunda entries delete + reinsert yapılır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateOvertimeInput> = await request.json();

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
    const { data: overtime, error: overtimeError } = await supabase
      .from("overtime_requests")
      .select("id, overtime_type")
      .eq("request_id", requestId)
      .single();

    if (overtimeError || !overtime) {
      return NextResponse.json({ error: "Overtime detail not found" }, { status: 404 });
    }

    // Detail patch'i hazırla — overtime_type değiştirilmesini desteklemiyoruz
    // (akış değişir, separate bir feature). Geri kalan tip-spesifik alanlar tarama edilir.
    const patch: Record<string, unknown> = {};
    if (body.month !== undefined) patch.month = body.month;
    if (body.year !== undefined) patch.year = body.year;
    if (body.reason_category !== undefined) patch.reason_category = body.reason_category;
    if (body.reason_detail !== undefined) patch.reason_detail = body.reason_detail;
    if (body.hr_note !== undefined) patch.hr_note = body.hr_note || null;

    if (overtime.overtime_type === "EMERGENCY" && body.overtime_type !== "STAFF_SHORTAGE") {
      const toTimestamptz = (date: string, time: string) => `${date}T${time}:00+03:00`;
      const b = body as Partial<CreateOvertimeInput & { [k: string]: unknown }>;
      if (b.work_location !== undefined) patch.work_location = b.work_location;
      if (b.work_start_date !== undefined) patch.work_start_date = b.work_start_date;
      if (b.work_end_date !== undefined) patch.work_end_date = b.work_end_date;
      if (b.work_reason !== undefined) patch.work_reason = b.work_reason;
      if (b.previous_shift_start_date && b.previous_shift_start_time) {
        patch.previous_shift_start = toTimestamptz(b.previous_shift_start_date as string, b.previous_shift_start_time as string);
      }
      if (b.previous_shift_end_date && b.previous_shift_end_time) {
        patch.previous_shift_end = toTimestamptz(b.previous_shift_end_date as string, b.previous_shift_end_time as string);
      }
      if (b.next_shift_start_date && b.next_shift_start_time) {
        patch.next_shift_start = toTimestamptz(b.next_shift_start_date as string, b.next_shift_start_time as string);
      }
      if (b.next_shift_end_date && b.next_shift_end_time) {
        patch.next_shift_end = toTimestamptz(b.next_shift_end_date as string, b.next_shift_end_time as string);
      }
    }

    const { error: updateError } = await supabase
      .from("overtime_requests")
      .update(patch)
      .eq("id", overtime.id);

    if (updateError) {
      console.error("[overtime PATCH] update failed:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // STAFF_SHORTAGE: entries replace
    if (overtime.overtime_type === "STAFF_SHORTAGE" && body.overtime_type === "STAFF_SHORTAGE" && Array.isArray(body.entries)) {
      const { error: delError } = await supabase
        .from("overtime_entries")
        .delete()
        .eq("overtime_request_id", overtime.id);

      if (delError) {
        console.error("[overtime PATCH] entries delete failed:", delError);
        return NextResponse.json({ error: "Failed to clear entries" }, { status: 500 });
      }

      if (body.entries.length > 0) {
        const entriesData = body.entries.map(entry => ({
          overtime_request_id: overtime.id,
          full_name: entry.full_name,
          role_title: entry.role_title,
          overtime_hours: entry.overtime_hours,
          overtime_pay: entry.overtime_pay,
        }));

        const { error: insertError } = await supabase
          .from("overtime_entries")
          .insert(entriesData);

        if (insertError) {
          console.error("[overtime PATCH] entries insert failed:", insertError);
          return NextResponse.json({ error: "Failed to insert entries" }, { status: 500 });
        }

        // Toplamları yeniden hesapla
        const totalHours = body.entries.reduce((s, e) => s + e.overtime_hours, 0);
        const totalPay = body.entries.reduce((s, e) => s + e.overtime_pay, 0);
        await supabase
          .from("overtime_requests")
          .update({ total_hours: totalHours, total_pay: totalPay })
          .eq("id", overtime.id);
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
    console.error("[overtime PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
