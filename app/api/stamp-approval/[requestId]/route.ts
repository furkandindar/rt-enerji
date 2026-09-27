import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { applyAuditStamp, canEditRequest } from "@/lib/workflow";
import {
  STAMP_PDF_BUCKET,
  buildOriginalPdfPath,
  parseSelectedPages,
  parseStampPositionFields,
} from "@/lib/stamp-approval/form-fields";

// Not: dinamik segment adı `[requestId]` — aynı seviyedeki `original-pdf` alt
// rotasıyla uyumlu olmak zorunda (Next aynı seviyede iki farklı segment adına
// izin vermez). route-map `getPatchUrl` → `/api/stamp-approval/<id>`.

// PATCH /api/stamp-approval/[requestId] — Kaşeli belge talebinin detayını günceller.
// multipart/form-data (POST ile aynı alanlar); tüm alanlar opsiyonel:
//   - pdf_file: gönderilirse orijinal PDF değiştirilir (eski dosya silinir)
//   - stamp_id, selected_pages, stamp_position, subject, description
//   - stamp_x_ratio + stamp_y_ratio (+ stamp_position_overrides): konum bir bütün
//     olarak güncellenir; ratio'lar gönderilip override gönderilmezse override'lar
//     temizlenir (POST'taki "yoksa null" semantiği).
// Status'u değiştirmez. Yeniden göndermek için POST /api/requests/[id]/resubmit kullanılır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const supabase = await createClient();
    const { requestId } = await params;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "multipart/form-data bekleniyor" }, { status: 400 });
    }

    // Auth
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

    // Talebi çek (eligibility için) — RLS'li client: kullanıcının göremediği
    // talep burada 404'e düşer.
    const { data: req, error: reqError } = await supabase
      .from("requests")
      .select("id, status, requester_employee_id, workflow_definition:workflow_definitions(code)")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const workflowDef = req.workflow_definition as { code?: string } | { code?: string }[] | null;
    const workflowCode = Array.isArray(workflowDef) ? workflowDef[0]?.code : workflowDef?.code;
    if (workflowCode !== "STAMP_APPROVAL") {
      return NextResponse.json({ error: "Bu talep kaşeli belge talebi değil" }, { status: 400 });
    }

    if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
      return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
    }

    // Aşağıdaki yazma service role ile (RLS bypass) yapıldığı için ORG_ADMIN dahil
    // yalnız yeniden gönderilecek (DRAFT / REVISION_REQUESTED) talepte izin verilir;
    // onay sürecindeki/tamamlanmış talebin belgesi değiştirilemez.
    if (req.status !== "DRAFT" && req.status !== "REVISION_REQUESTED") {
      return NextResponse.json(
        { error: `Cannot edit from status ${req.status}` },
        { status: 409 }
      );
    }

    // Validasyon (POST ile aynı — ortak helper)
    const positionFields = parseStampPositionFields(formData);
    if (!positionFields.ok) {
      return NextResponse.json({ error: positionFields.error }, { status: 400 });
    }

    const pdfEntry = formData.get("pdf_file");
    const pdfFile = pdfEntry instanceof File && pdfEntry.size > 0 ? pdfEntry : null;
    if (pdfFile && pdfFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Sadece PDF dosyası yüklenebilir" }, { status: 400 });
    }

    const stampIdRaw = formData.get("stamp_id");
    if (stampIdRaw !== null && !String(stampIdRaw).trim()) {
      return NextResponse.json({ error: "Kaşe seçimi gerekli" }, { status: 400 });
    }

    const subjectRaw = formData.get("subject");
    if (subjectRaw !== null && !String(subjectRaw).trim()) {
      return NextResponse.json({ error: "Konu gerekli" }, { status: 400 });
    }

    // Detay güncellemesi + Storage işlemleri SERVICE ROLE ile yapılır. Gerekçe:
    //  - stamp_requests UPDATE RLS politikası yalnız PENDING onaycıya veya
    //    ORG_ADMIN'e izin veriyor; revize aşamasındaki talep sahibi RLS'li
    //    client ile kendi detay satırını güncelleyemez (UPDATE 0 satır döner).
    //  - stamp_requests SELECT politikasında ORG_ADMIN dalı yok; admin düzenlemesinde
    //    mevcut satırı (eski PDF yolu) okumak için de gerekli.
    //  - request-documents bucket'ına yazma/silme yalnız service_role'e açık (POST
    //    rotası da yüklemeyi service role ile yapıyor).
    // Yetki kontrolü yukarıda RLS'li client ile yapıldı (auth + canEditRequest +
    // workflow code); service role yalnız bu doğrulamadan SONRA ve yalnız bu
    // talebin satırı (request_id filtresi) için kullanılır. DB policy değişmedi.
    const supabaseAdmin = createServiceRoleClient();

    const { data: stampRow, error: stampRowError } = await supabaseAdmin
      .from("stamp_requests")
      .select("id, stamped_pdf_path")
      .eq("request_id", requestId)
      .single();

    if (stampRowError || !stampRow) {
      console.error("[stamp-approval PATCH] stamp_request not found:", stampRowError);
      return NextResponse.json({ error: "Kaşe talebi detayı bulunamadı" }, { status: 404 });
    }

    // Detay tabloyu güncelle (sadece gönderilen alanlar)
    const patch: Record<string, unknown> = {};
    if (stampIdRaw !== null) patch.stamp_id = String(stampIdRaw).trim();
    if (formData.has("selected_pages")) patch.selected_pages = parseSelectedPages(formData);
    if (formData.has("stamp_position")) {
      patch.stamp_position = (formData.get("stamp_position") as string) || "bottom-right";
    }
    if (subjectRaw !== null) patch.subject = String(subjectRaw).trim();
    if (formData.has("description")) {
      patch.description = String(formData.get("description") ?? "").trim() || null;
    }
    if (formData.has("stamp_x_ratio") || formData.has("stamp_y_ratio")) {
      patch.stamp_x_ratio = positionFields.stampXRatio;
      patch.stamp_y_ratio = positionFields.stampYRatio;
      patch.stamp_position_overrides = positionFields.stampPositionOverrides;
    } else if (formData.has("stamp_position_overrides")) {
      patch.stamp_position_overrides = positionFields.stampPositionOverrides;
    }

    // Önceki turun kaşeli çıktısı yeni turda bayat kalmamalı. Kaşeli PDF yalnız final
    // onayda üretildiği ve revize yalnız PENDING talepte istenebildiği için normalde
    // zaten NULL'dır; bu savunma amaçlı temizliktir (dosyanın kendisi Storage'da kalır).
    if (stampRow.stamped_pdf_path) {
      patch.stamped_pdf_path = null;
    }

    // Yeni PDF: benzersiz yeni yola yükle (POST ile aynı düzen, upsert yok), sonra
    // DB'yi yeni yola çevir. Eski orijinal SİLİNMEZ — önceki revize turunun
    // onaycılarının gördüğü belge denetim izi olarak Storage'da kalır (eski cycle
    // request_approvals kayıtları gibi). Güncelleme başarısız olursa yalnız yeni
    // yüklenen dosya geri alınır.
    let newPdfPath: string | null = null;
    if (pdfFile) {
      newPdfPath = buildOriginalPdfPath();
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STAMP_PDF_BUCKET)
        .upload(newPdfPath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        console.error("[stamp-approval PATCH] PDF upload failed:", uploadError);
        return NextResponse.json({ error: "PDF yükleme başarısız" }, { status: 500 });
      }
      patch.original_pdf_path = newPdfPath;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("stamp_requests")
        .update(patch)
        .eq("request_id", requestId);

      if (updateError) {
        console.error("[stamp-approval PATCH] update failed:", updateError);
        // Rollback: yeni yüklenen PDF'i sil
        if (newPdfPath) {
          await supabaseAdmin.storage.from(STAMP_PDF_BUCKET).remove([newPdfPath]);
        }
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
    console.error("[stamp-approval PATCH] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
