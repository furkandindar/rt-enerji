import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActingRights } from "@/lib/workflow/delegation";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB

// POST /api/workflow-completion/upload-signed-pdf
// Workflow'un COMPLETION fazındaki ykb_signed_pdf adımı için imzalı taranmış
// PDF'in yüklendiği generic endpoint. Frontend bu yola dosyayı yollayıp dönen
// pdf_path'i sonra /api/approvals/[id] PATCH çağrısında ykb_signed_pdf_path
// olarak gönderir.
export async function POST(request: Request) {
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

    const formData = await request.formData();
    const pdfFile = formData.get("pdf_file") as File | null;
    const requestId = formData.get("request_id") as string | null;

    if (!pdfFile) {
      return NextResponse.json({ error: "PDF dosyası gerekli" }, { status: 400 });
    }
    if (!requestId) {
      return NextResponse.json({ error: "request_id gerekli" }, { status: 400 });
    }
    if (pdfFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Yalnızca PDF dosyası yüklenebilir" }, { status: 400 });
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "Dosya boyutu 25 MB sınırını aşıyor" }, { status: 400 });
    }

    // Talebin AWAITING_COMPLETION durumunda olduğunu doğrula
    const { data: targetRequest, error: reqError } = await supabase
      .from("requests")
      .select("id, status, current_step, current_revision_cycle")
      .eq("id", requestId)
      .single();

    if (reqError || !targetRequest) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    if (targetRequest.status !== "AWAITING_COMPLETION") {
      return NextResponse.json({ error: "Talep tamamlama bekleme aşamasında değil" }, { status: 400 });
    }

    // Kullanıcının COMPLETION fazındaki ykb_signed_pdf PENDING onaycı olduğunu doğrula
    // V5: revize edilen taleplerde eski cycle'ın PENDING satırları audit için
    // duruyor — cycle + sıra filtresi olmadan aynı onaycıya birden fazla satır
    // döner ve .single() patlar (revize edilmiş taleplerde YKB yükleme 403'ü).
    // Vekalet (B2): approver filtresi kaldırıldı — satır RLS ile onaycıya VE aktif
    // vekile görünür; işlem yetkisi resolveActingRights (DB can_act_on_approval) ile.
    const { data: completionApproval } = await supabase
      .from("request_approvals")
      .select(`
        id,
        status,
        approver_employee_id,
        workflow_step:workflow_steps!inner(phase, form_section_key)
      `)
      .eq("request_id", requestId)
      .eq("status", "PENDING")
      .eq("revision_cycle", targetRequest.current_revision_cycle ?? 0)
      .eq("sequence_order", targetRequest.current_step)
      .maybeSingle();

    if (!completionApproval) {
      return NextResponse.json({ error: "Bu adımda yükleme yapma yetkiniz yok" }, { status: 403 });
    }

    const acting = await resolveActingRights(
      supabase,
      completionApproval.id,
      completionApproval.approver_employee_id,
      appUser.employee_id
    );
    if (!acting.canAct) {
      return NextResponse.json({ error: "Bu adımda yükleme yapma yetkiniz yok" }, { status: 403 });
    }

    const stepPhase = Array.isArray(completionApproval.workflow_step)
      ? completionApproval.workflow_step[0]?.phase
      : (completionApproval.workflow_step as { phase: string; form_section_key: string } | null)?.phase;
    const stepFormKey = Array.isArray(completionApproval.workflow_step)
      ? completionApproval.workflow_step[0]?.form_section_key
      : (completionApproval.workflow_step as { phase: string; form_section_key: string } | null)?.form_section_key;

    if (stepPhase !== "COMPLETION" || stepFormKey !== "ykb_signed_pdf") {
      return NextResponse.json({ error: "Bu adımda PDF yüklenmesi beklenmiyor" }, { status: 400 });
    }

    // Storage'a yükle
    const supabaseAdmin = createServiceRoleClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const fileName = `signed_${Date.now()}.pdf`;
    const pdfPath = `${year}/${month}/${fileName}`;
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from("request-documents")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading signed completion PDF:", uploadError);
      return NextResponse.json({ error: "PDF yükleme başarısız" }, { status: 500 });
    }

    return NextResponse.json({ pdf_path: pdfPath }, { status: 201 });
  } catch (error) {
    console.error("Unexpected error in workflow-completion/upload-signed-pdf:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
