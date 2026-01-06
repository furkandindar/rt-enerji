import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  notifyApprover,
  notifyRequestApproved,
  notifyRequestRejected
} from "@/lib/workflow";
import { generateRequestPDF } from "@/lib/pdf/generate-request-pdf";
import { uploadRequestPDF } from "@/lib/storage/upload-request-pdf";

// PATCH /api/approvals/[id] - Onay/Red ver
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();

    const { decision, comment } = body as { 
      decision: 'APPROVED' | 'REJECTED'; 
      comment?: string;
    };

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    // 1. Mevcut kullanıcının employee_id'sini al
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

    // 2. Approval kaydını getir ve kontrol et
    const { data: approval, error: approvalError } = await supabase
      .from("request_approvals")
      .select(`
        *,
        workflow_step:workflow_steps(*),
        request:requests(*)
      `)
      .eq("id", id)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    // Onaycı kontrolü
    if (approval.approver_employee_id !== appUser.employee_id) {
      return NextResponse.json({ error: "You are not the approver" }, { status: 403 });
    }

    // Zaten işlem yapılmış mı?
    if (approval.status !== 'PENDING') {
      return NextResponse.json({ error: "Already processed" }, { status: 400 });
    }

    // Sırası mı?
    const requestData = approval.request;
    const stepData = approval.workflow_step;
    if (requestData.current_step !== stepData.step_order) {
      return NextResponse.json({ error: "Not your turn to approve" }, { status: 400 });
    }

    // 3. Approval'ı güncelle
    const { error: updateError } = await supabase
      .from("request_approvals")
      .update({
        status: decision,
        comment: comment || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating approval:", updateError);
      return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
    }

    // 4. Workflow bilgilerini al (bildirimler için)
    const { data: workflowDef } = await supabase
      .from("workflow_definitions")
      .select("name")
      .eq("id", requestData.workflow_definition_id)
      .single();

    const workflowName = workflowDef?.name || "Talep";

    // Onaycının adını al
    const { data: approverEmployee } = await supabase
      .from("employees")
      .select("first_name, last_name")
      .eq("id", appUser.employee_id)
      .single();

    const approverName = approverEmployee
      ? `${approverEmployee.first_name} ${approverEmployee.last_name}`
      : "Yönetici";

    // 5. Request'i güncelle ve bildirim gönder
    if (decision === 'REJECTED') {
      // Reddedildi - talep reddedilir
      await supabase
        .from("requests")
        .update({
          status: 'REJECTED',
          completed_at: new Date().toISOString(),
        })
        .eq("id", requestData.id);

      // Talep edene "reddedildi" bildirimi gönder
      await notifyRequestRejected(
        supabase,
        requestData.requester_employee_id,
        requestData.id,
        workflowName,
        approverName
      );
    } else {
      // Onaylandı - sonraki adıma geç veya tamamla
      const { data: totalSteps } = await supabase
        .from("workflow_steps")
        .select("id")
        .eq("workflow_definition_id", requestData.workflow_definition_id);

      const isLastStep = requestData.current_step >= (totalSteps?.length || 0);

      if (isLastStep) {
        // Son adım - talep onaylandı
        await supabase
          .from("requests")
          .update({
            status: 'APPROVED',
            completed_at: new Date().toISOString(),
          })
          .eq("id", requestData.id);

        // PDF oluştur ve Storage'a yükle
        try {
          console.log('Generating PDF for request:', requestData.id);
          const pdfBuffer = await generateRequestPDF({
            requestId: requestData.id,
            supabase,
          });

          console.log('Uploading PDF to storage...');
          const pdfPath = await uploadRequestPDF({
            requestId: requestData.id,
            pdfBuffer,
          });

          console.log('PDF uploaded successfully:', pdfPath);

          // PDF path'i database'e kaydet
          await supabase
            .from("requests")
            .update({ pdf_path: pdfPath })
            .eq("id", requestData.id);

          console.log('PDF path saved to database');
        } catch (pdfError) {
          // PDF oluşturma hatası - loglayalım ama işlemi durdurmayalım
          console.error('Error generating/uploading PDF:', pdfError);
          // İsteğe bağlı: Hata bildirimi gönderilebilir
        }

        // Talep edene "onaylandı" bildirimi gönder
        await notifyRequestApproved(
          supabase,
          requestData.requester_employee_id,
          requestData.id,
          workflowName
        );
      } else {
        // Sonraki adıma geç
        const nextStep = requestData.current_step + 1;

        await supabase
          .from("requests")
          .update({
            current_step: nextStep,
          })
          .eq("id", requestData.id);

        // Sonraki onaycıya bildirim gönder
        const { data: nextApprovalData, error: nextApprovalError } = await supabase
          .from("request_approvals")
          .select(`
            approver_employee_id,
            workflow_step:workflow_steps(step_order)
          `)
          .eq("request_id", requestData.id)
          .eq("status", "PENDING");

        console.log("Next approval query result:", nextApprovalData, "Error:", nextApprovalError);

        // step_order'a göre filtrele
        const nextApproval = nextApprovalData?.find((a: { workflow_step: { step_order: number } | { step_order: number }[] | null }) => {
          const stepOrder = Array.isArray(a.workflow_step)
            ? a.workflow_step[0]?.step_order
            : a.workflow_step?.step_order;
          return stepOrder === nextStep;
        });

        console.log("Found next approval for step", nextStep, ":", nextApproval);

        if (nextApproval) {
          // Talep edenin adını al
          const { data: requester } = await supabase
            .from("employees")
            .select("first_name, last_name")
            .eq("id", requestData.requester_employee_id)
            .single();

          const requesterName = requester
            ? `${requester.first_name} ${requester.last_name}`
            : "Bir çalışan";

          await notifyApprover(
            supabase,
            nextApproval.approver_employee_id,
            requesterName,
            requestData.id,
            workflowName
          );
        }
      }
    }

    // 6. Güncellenmiş approval'ı döndür
    const { data: updatedApproval } = await supabase
      .from("request_approvals")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json(updatedApproval);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

