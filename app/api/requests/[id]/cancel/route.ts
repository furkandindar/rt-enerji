import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse, after } from "next/server";
import { applyAuditStamp, canCancelRequest, createNotification } from "@/lib/workflow";
import { buildAndUploadRequestPDF } from "@/lib/pdf/build-and-upload-request-pdf";
import { enqueueSharePointSyncFromStorage } from "@/lib/sharepoint/enqueue-sync";

// POST /api/requests/[id]/cancel
// Talep eden veya ORG_ADMIN talebi CANCELLED'a çeker (soft cancel, hard delete yok).
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
      .select(`
        id,
        status,
        requester_employee_id,
        workflow_definition_id,
        current_revision_cycle,
        current_step,
        workflow_definition:workflow_definitions(name, code)
      `)
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 2b. Aktif cycle onay kayıtları — eligibility (imza ilerledi mi?) ve bekleyen
    //     onaycı bildirimi için. REQUESTER tipindeki adım (talep gönderme imzası)
    //     "gerçek onay" sayılmaz; withdraw eligibility'siyle aynı mantık.
    const { data: cycleApprovals } = await supabase
      .from("request_approvals")
      .select("status, sequence_order, approver_employee_id, workflow_step:workflow_steps(approver_type)")
      .eq("request_id", requestId)
      .eq("revision_cycle", req.current_revision_cycle ?? 0);

    const realApprovals = (cycleApprovals ?? []).filter((a) => {
      const stepType = (a as unknown as { workflow_step?: { approver_type?: string } }).workflow_step?.approver_type;
      return stepType !== "REQUESTER";
    });

    // 3. Eligibility (faz-bazlı: admin her non-terminal; talep eden yalnızca imza öncesi)
    const ok = canCancelRequest(
      { status: req.status, requester_employee_id: req.requester_employee_id },
      realApprovals,
      { employeeId: appUser.employee_id, role: appUser.role }
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Cannot cancel: terminal state or unauthorized" },
        { status: 409 }
      );
    }

    // 4. Status'u CANCELLED'a çek
    const { error: updateError } = await supabase
      .from("requests")
      .update({
        status: "CANCELLED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      console.error("[cancel] update failed:", updateError);
      return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
    }

    // 5. Audit
    await applyAuditStamp(supabase, requestId, "CANCELLED", appUser.employee_id);

    // 5b. İptal edilen talep de arşive düşer (İptal Edilen klasörü). PDF
    //     response'tan sonra üretilir; hata iptali geri almaz, sadece log'lanır.
    //     Service-role şart: after() kullanıcı oturumundan bağımsız koşar ve
    //     genel PDF sorgusu iptal edenin RLS görüşünü aşan join'ler içerir.
    const workflowCode =
      (req as unknown as { workflow_definition?: { code?: string } }).workflow_definition?.code ?? null;
    after(async () => {
      try {
        const admin = createServiceRoleClient();
        if (workflowCode === "STAMP_APPROVAL") {
          // Kaşe süreci için üretilebilir PDF şablonu yok — orijinal belgeyi
          // pdf_path'e kopyala ve doğrudan arşivle (reject dalıyla aynı desen).
          const { data: stampReq } = await admin
            .from("stamp_requests")
            .select("original_pdf_path")
            .eq("request_id", requestId)
            .single();

          if (stampReq?.original_pdf_path) {
            await admin
              .from("requests")
              .update({ pdf_path: stampReq.original_pdf_path })
              .eq("id", requestId);
            await enqueueSharePointSyncFromStorage({
              requestId,
              supabasePdfPath: stampReq.original_pdf_path,
            });
          } else {
            console.warn("[cancel] kaşe talebinde original_pdf_path yok:", requestId);
          }
        } else {
          await buildAndUploadRequestPDF({ requestId, supabase: admin });
        }
      } catch (pdfErr) {
        console.error("[cancel] PDF/arşiv üretimi başarısız (non-fatal):", pdfErr);
      }
    });

    // 6. Daha önce APPROVED veren onaycılara "talep iptal edildi" bildirimi
    //    (aktif cycle'da APPROVED olanlar — distinct, talep edeni hariç tut)
    try {
      const workflowName =
        (req as unknown as { workflow_definition?: { name?: string } }).workflow_definition?.name ?? "Talep";
      const activeCycle = req.current_revision_cycle ?? 0;
      const { data: approvedRows } = await supabase
        .from("request_approvals")
        .select("approver_employee_id")
        .eq("request_id", requestId)
        .eq("revision_cycle", activeCycle)
        .eq("status", "APPROVED");

      const recipients = new Set<string>();
      for (const row of approvedRows ?? []) {
        if (row.approver_employee_id && row.approver_employee_id !== req.requester_employee_id) {
          recipients.add(row.approver_employee_id);
        }
      }

      for (const employeeId of recipients) {
        // employeeId → app_users.id eşlemesi
        const { data: targetUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("employee_id", employeeId)
          .single();
        if (!targetUser) continue;

        await createNotification(supabase, {
          userId: targetUser.id,
          title: "Talep İptal Edildi",
          message: `Önceden onayladığınız ${workflowName} talebi iptal edildi.`,
          type: "REQUEST_CANCELLED",
          referenceId: requestId,
        });
      }

      // 6b. Aktif adımda BEKLEYEN onaycıya da haber ver. Bu kişi APPROVED listesinde
      //     olmadığı için yukarıdaki döngüye girmez; oysa iptali en çok bilmesi
      //     gereken kişi odur (aksi halde iptal edilmiş talebi "reddetme" durumu olur).
      const pendingApprover = (cycleApprovals ?? []).find(
        (a) => a.status === "PENDING" && a.sequence_order === req.current_step
      );
      const pendingApproverId = pendingApprover?.approver_employee_id;
      if (pendingApproverId && pendingApproverId !== req.requester_employee_id) {
        const { data: pendingUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("employee_id", pendingApproverId)
          .single();
        if (pendingUser) {
          await createNotification(supabase, {
            userId: pendingUser.id,
            title: "Talep İptal Edildi",
            message: `Onayınızı bekleyen ${workflowName} talebi iptal edildi.`,
            type: "REQUEST_CANCELLED",
            referenceId: requestId,
          });
        }
      }
    } catch (notifErr) {
      console.error("[cancel] notification dispatch failed:", notifErr);
    }

    return NextResponse.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    console.error("[cancel] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
