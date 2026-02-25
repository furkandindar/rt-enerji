import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  notifyApprover,
  notifyRequestApproved,
  notifyRequestRejected
} from "@/lib/workflow";
import { generateRequestPDF } from "@/lib/pdf/generate-request-pdf";
import { mergeAttachments } from "@/lib/pdf/merge-attachments";
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

    const { decision, comment, hr_fields, salary_consent_fields, onboarding_fields } = body as {
      decision: 'APPROVED' | 'REJECTED';
      comment?: string;
      hr_fields?: {
        remaining_days?: number;
        hr_note?: string;
      };
      salary_consent_fields?: {
        consent: boolean;
      };
      onboarding_fields?: {
        section_key: string;
        items: Record<string, { status: string; notes: string }>;
      };
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

    // 2b. Zorunlu attachment kontrolü (onay durumunda)
    if (decision === 'APPROVED') {
      const { data: requiredConfigs } = await supabase
        .from("workflow_step_attachments")
        .select("id, label")
        .eq("workflow_step_id", stepData.id)
        .eq("is_required", true);

      if (requiredConfigs && requiredConfigs.length > 0) {
        const { data: uploadedFiles } = await supabase
          .from("request_attachments")
          .select("step_attachment_config_id")
          .eq("request_id", requestData.id)
          .in("step_attachment_config_id", requiredConfigs.map((c: { id: string }) => c.id));

        const missingConfigs = requiredConfigs.filter(
          (c: { id: string }) => !uploadedFiles?.some((f: { step_attachment_config_id: string }) => f.step_attachment_config_id === c.id)
        );

        if (missingConfigs.length > 0) {
          const missingLabels = missingConfigs.map((c: { label: string }) => c.label).join(", ");
          return NextResponse.json({
            error: `Zorunlu ek dosyalar yüklenmemiş: ${missingLabels}`,
          }, { status: 400 });
        }
      }
    }

    // 3. FILL_AND_SIGN adımları için HR alanlarını güncelle (sadece onay durumunda)
    if (decision === 'APPROVED' && stepData.action_type === 'FILL_AND_SIGN' && stepData.form_section_key === 'hr_details') {
      // remaining_days zorunlu kontrol
      if (hr_fields?.remaining_days === undefined || hr_fields?.remaining_days === null) {
        return NextResponse.json({ error: "Kalan izin günü (remaining_days) zorunludur" }, { status: 400 });
      }

      // leave_requests tablosunu güncelle
      const { data: leaveRequest } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("request_id", requestData.id)
        .single();

      if (leaveRequest) {
        const { error: hrUpdateError } = await supabase
          .from("leave_requests")
          .update({
            remaining_days: hr_fields.remaining_days,
            hr_note: hr_fields.hr_note || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leaveRequest.id);

        if (hrUpdateError) {
          console.error("Error updating HR fields:", hrUpdateError);
          return NextResponse.json({ error: "Failed to update HR fields" }, { status: 500 });
        }

        console.log("HR fields updated successfully:", {
          remaining_days: hr_fields.remaining_days,
          hr_note: hr_fields.hr_note,
        });
      }
    }

    // 3b. FILL_AND_SIGN adımları için salary_deduction_consent güncelle (sadece onay durumunda)
    if (decision === 'APPROVED' && stepData.action_type === 'FILL_AND_SIGN' && stepData.form_section_key === 'salary_deduction_consent') {
      if (!salary_consent_fields?.consent) {
        return NextResponse.json({ error: "Maaş kesinti muvafakatı zorunludur" }, { status: 400 });
      }

      const { data: advanceRequest } = await supabase
        .from("salary_advance_requests")
        .select("id")
        .eq("request_id", requestData.id)
        .single();

      if (advanceRequest) {
        const { error: consentUpdateError } = await supabase
          .from("salary_advance_requests")
          .update({
            salary_deduction_consent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", advanceRequest.id);

        if (consentUpdateError) {
          console.error("Error updating salary deduction consent:", consentUpdateError);
          return NextResponse.json({ error: "Failed to update salary deduction consent" }, { status: 500 });
        }

        console.log("Salary deduction consent updated successfully for request:", requestData.id);
      }
    }

    // 3c. FILL_AND_SIGN adımları için onboarding section alanlarını güncelle (sadece onay durumunda)
    if (decision === 'APPROVED' && stepData.action_type === 'FILL_AND_SIGN' && onboarding_fields?.section_key) {
      const validSections = ['section_2', 'section_3', 'section_4', 'section_5', 'section_6'];
      if (!validSections.includes(onboarding_fields.section_key)) {
        return NextResponse.json({ error: "Geçersiz section key" }, { status: 400 });
      }

      if (!onboarding_fields.items || Object.keys(onboarding_fields.items).length === 0) {
        return NextResponse.json({ error: "Checklist alanları zorunludur" }, { status: 400 });
      }

      // onboarding_requests kaydını bul
      const { data: onboardingRequest } = await supabase
        .from("onboarding_requests")
        .select("id")
        .eq("request_id", requestData.id)
        .single();

      if (onboardingRequest) {
        // items'dan update objesi oluştur
        const updateData: Record<string, string | null> = {
          updated_at: new Date().toISOString(),
        };

        for (const [key, value] of Object.entries(onboarding_fields.items)) {
          updateData[`${key}_status`] = value.status;
          updateData[`${key}_notes`] = value.notes || null;
        }

        const { error: onboardingUpdateError } = await supabase
          .from("onboarding_requests")
          .update(updateData)
          .eq("id", onboardingRequest.id);

        if (onboardingUpdateError) {
          console.error("Error updating onboarding fields:", onboardingUpdateError);
          return NextResponse.json({ error: "Failed to update onboarding fields" }, { status: 500 });
        }

        console.log("Onboarding fields updated successfully for section:", onboarding_fields.section_key);
      }
    }

    // 4. Approval'ı güncelle
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

          // Ek dosyaları (attachment) ana PDF'e birleştir
          console.log('Merging attachments...');
          const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestData.id, supabase);

          console.log('Uploading PDF to storage...');
          const pdfPath = await uploadRequestPDF({
            requestId: requestData.id,
            pdfBuffer: finalPdfBuffer,
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

