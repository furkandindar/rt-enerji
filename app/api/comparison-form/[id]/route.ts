import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import type {
  CreateMukayeseInput,
  CreateMukayeseItemInput,
  CreateMukayeseSupplierInput,
  CreateMukayeseCellPriceInput,
} from "@/lib/workflow";

// PATCH /api/comparison-form/[id] — Mukayese formu detayını ve matrix'i günceller.
// Matrix (items/suppliers/prices) gelirse delete + reinsert yapılır.
// FK CASCADE sayesinde mukayese_prices satırları items/suppliers silinince otomatik temizlenir.
//
// NOT: Bu işlem atomik değildir; Supabase JS client'ta multi-table transaction yok.
//      Frontend hata durumunda kullanıcıya retry önermeli.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;
    const body: Partial<CreateMukayeseInput> & {
      fx_eur_try?: number | null;
      fx_usd_try?: number | null;
      fx_eur_usd?: number | null;
      fx_snapshot_at?: string | null;
    } = await request.json();

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
    const { data: mukayese, error: mukayeseError } = await supabase
      .from("mukayese_requests")
      .select("id")
      .eq("request_id", requestId)
      .single();

    if (mukayeseError || !mukayese) {
      return NextResponse.json({ error: "Mukayese detail not found" }, { status: 404 });
    }

    // Header update
    const patch: Record<string, unknown> = {};
    if (body.project_title !== undefined) patch.project_title = body.project_title;
    if (body.form_currency !== undefined) patch.form_currency = body.form_currency;
    if (body.fx_eur_try !== undefined) patch.fx_eur_try = body.fx_eur_try ?? null;
    if (body.fx_usd_try !== undefined) patch.fx_usd_try = body.fx_usd_try ?? null;
    if (body.fx_eur_usd !== undefined) patch.fx_eur_usd = body.fx_eur_usd ?? null;
    if (body.fx_snapshot_at !== undefined) patch.fx_snapshot_at = body.fx_snapshot_at ?? null;
    if (body.form_date !== undefined) patch.form_date = body.form_date;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.kdv_rate !== undefined) patch.kdv_rate = body.kdv_rate;
    if (body.preparer_full_name !== undefined) patch.preparer_full_name = body.preparer_full_name;
    if (body.company !== undefined) patch.company = body.company;
    if (body.subject !== undefined) patch.subject = body.subject;
    if (body.request_content !== undefined) patch.request_content = body.request_content;
    if (body.request_amount_text !== undefined) patch.request_amount_text = body.request_amount_text;
    if (body.request_reason !== undefined) patch.request_reason = body.request_reason;

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase
        .from("mukayese_requests")
        .update(patch)
        .eq("id", mukayese.id);

      if (updateError) {
        console.error("[comparison-form PATCH] update failed:", updateError);
        return NextResponse.json({ error: "Failed to update header" }, { status: 500 });
      }
    }

    // Matrix değişiyor mu? items / suppliers / prices'tan en az biri varsa hepsini yeniden kur.
    const matrixChange =
      Array.isArray(body.items) || Array.isArray(body.suppliers) || Array.isArray(body.prices);

    if (matrixChange) {
      if (!Array.isArray(body.items) || !Array.isArray(body.suppliers) || !Array.isArray(body.prices)) {
        return NextResponse.json(
          { error: "Matrix güncellemesinde items, suppliers ve prices birlikte gönderilmelidir" },
          { status: 400 }
        );
      }

      // 1. items'ı sil → mukayese_prices CASCADE ile gider
      const { error: delItemsError } = await supabase
        .from("mukayese_items")
        .delete()
        .eq("mukayese_request_id", mukayese.id);
      if (delItemsError) {
        console.error("[comparison-form PATCH] delete items failed:", delItemsError);
        return NextResponse.json({ error: "Failed to clear items" }, { status: 500 });
      }

      // 2. suppliers'ı sil (prices zaten gitmiş olmalı; yine de güvenli)
      const { error: delSuppliersError } = await supabase
        .from("mukayese_suppliers")
        .delete()
        .eq("mukayese_request_id", mukayese.id);
      if (delSuppliersError) {
        console.error("[comparison-form PATCH] delete suppliers failed:", delSuppliersError);
        return NextResponse.json({ error: "Failed to clear suppliers" }, { status: 500 });
      }

      // 3. items insert + ID al
      const itemsPayload = (body.items as CreateMukayeseItemInput[]).map(it => ({
        mukayese_request_id: mukayese.id,
        row_order: it.row_order,
        row_type: it.row_type,
        description: it.description ?? null,
        quantity: it.quantity ?? null,
        unit: it.unit ?? null,
      }));
      const { data: insertedItems, error: insertItemsError } = await supabase
        .from("mukayese_items")
        .insert(itemsPayload)
        .select("id, row_order");
      if (insertItemsError || !insertedItems) {
        console.error("[comparison-form PATCH] insert items failed:", insertItemsError);
        return NextResponse.json({ error: "Failed to insert items" }, { status: 500 });
      }

      // 4. suppliers insert + ID al
      const suppliersPayload = (body.suppliers as CreateMukayeseSupplierInput[]).map(s => ({
        mukayese_request_id: mukayese.id,
        column_order: s.column_order,
        company_name: s.company_name,
        payment_terms: s.payment_terms ?? null,
        technical_description: s.technical_description ?? null,
        delivery_time: s.delivery_time ?? null,
        contact_name: s.contact_name ?? null,
        contact_phone: s.contact_phone ?? null,
      }));
      const { data: insertedSuppliers, error: insertSuppliersError } = await supabase
        .from("mukayese_suppliers")
        .insert(suppliersPayload)
        .select("id, column_order");
      if (insertSuppliersError || !insertedSuppliers) {
        console.error("[comparison-form PATCH] insert suppliers failed:", insertSuppliersError);
        return NextResponse.json({ error: "Failed to insert suppliers" }, { status: 500 });
      }

      // 5. row_order/column_order → id eşlemesi ile prices insert
      const itemIdByRow = new Map<number, string>();
      for (const it of insertedItems) itemIdByRow.set(it.row_order, it.id);
      const supplierIdByCol = new Map<number, string>();
      for (const s of insertedSuppliers) supplierIdByCol.set(s.column_order, s.id);

      const pricesPayload: { mukayese_item_id: string; mukayese_supplier_id: string; unit_price: number }[] = [];
      for (const p of body.prices as CreateMukayeseCellPriceInput[]) {
        const itemId = itemIdByRow.get(p.row_order);
        const supplierId = supplierIdByCol.get(p.column_order);
        if (!itemId || !supplierId) continue;
        pricesPayload.push({
          mukayese_item_id: itemId,
          mukayese_supplier_id: supplierId,
          unit_price: p.unit_price,
        });
      }

      if (pricesPayload.length > 0) {
        const { error: insertPricesError } = await supabase
          .from("mukayese_prices")
          .insert(pricesPayload);
        if (insertPricesError) {
          console.error("[comparison-form PATCH] insert prices failed:", insertPricesError);
          return NextResponse.json({ error: "Failed to insert prices" }, { status: 500 });
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
    console.error("[comparison-form PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
