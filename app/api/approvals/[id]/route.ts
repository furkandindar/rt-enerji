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
import { stampPDF, type StampPositionOverrides } from "@/lib/pdf/stamp-pdf";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { StampPosition } from "@/lib/workflow/types";

// PATCH /api/approvals/[id] - Onay/Red ver
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();

    const { decision, comment, hr_fields, salary_consent_fields, onboarding_fields, separation_fields, travel_completion_fields, signature_data_url } = body as {
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
      separation_fields?: {
        section_key: string;
        items: Record<string, { status: string; notes: string }>;
      };
      travel_completion_fields?: {
        actual_departure_at: string;
        actual_return_at: string;
      };
      signature_data_url?: string;
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

    // Sırası mı? (sequence_order — DYNAMIC_USER_LIST ile uyumlu)
    const requestData = approval.request;
    const stepData = approval.workflow_step;
    if (requestData.current_step !== approval.sequence_order) {
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

    // 3d. FILL_AND_SIGN adımları için separation section alanlarını güncelle (sadece onay durumunda)
    if (decision === 'APPROVED' && stepData.action_type === 'FILL_AND_SIGN' && separation_fields?.section_key) {
      const validSections = ['section_1', 'section_2', 'section_3', 'section_4', 'section_5', 'section_6', 'section_7', 'section_8'];
      if (!validSections.includes(separation_fields.section_key)) {
        return NextResponse.json({ error: "Geçersiz section key" }, { status: 400 });
      }

      if (!separation_fields.items || Object.keys(separation_fields.items).length === 0) {
        return NextResponse.json({ error: "Checklist alanları zorunludur" }, { status: 400 });
      }

      // separation_requests kaydını bul
      const { data: separationRequest } = await supabase
        .from("separation_requests")
        .select("id")
        .eq("request_id", requestData.id)
        .single();

      if (separationRequest) {
        // items'dan update objesi oluştur
        const updateData: Record<string, string | null> = {
          updated_at: new Date().toISOString(),
        };

        for (const [key, value] of Object.entries(separation_fields.items)) {
          updateData[`${key}_status`] = value.status;
          updateData[`${key}_notes`] = value.notes || null;
        }

        const { error: separationUpdateError } = await supabase
          .from("separation_requests")
          .update(updateData)
          .eq("id", separationRequest.id);

        if (separationUpdateError) {
          console.error("Error updating separation fields:", separationUpdateError);
          return NextResponse.json({ error: "Failed to update separation fields" }, { status: 500 });
        }

        console.log("Separation fields updated successfully for section:", separation_fields.section_key);
      }
    }

    // 3e. FILL_AND_SIGN adımları için travel completion alanlarını güncelle (V4: asistan gerçekleşen tarihleri girer)
    if (decision === 'APPROVED' && stepData.action_type === 'FILL_AND_SIGN' && stepData.form_section_key === 'actual_dates') {
      if (!travel_completion_fields?.actual_departure_at || !travel_completion_fields?.actual_return_at) {
        return NextResponse.json({ error: "Gerçekleşen gidiş ve dönüş tarihleri zorunludur" }, { status: 400 });
      }

      const { data: travelRequest } = await supabase
        .from("travel_assignment_requests")
        .select("id")
        .eq("request_id", requestData.id)
        .single();

      if (travelRequest) {
        const { error: travelUpdateError } = await supabase
          .from("travel_assignment_requests")
          .update({
            actual_departure_at: travel_completion_fields.actual_departure_at,
            actual_return_at: travel_completion_fields.actual_return_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", travelRequest.id);

        if (travelUpdateError) {
          console.error("Error updating travel completion fields:", travelUpdateError);
          return NextResponse.json({ error: "Failed to update travel completion fields" }, { status: 500 });
        }

        console.log("Travel completion fields updated successfully");
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
      .select("code, name")
      .eq("id", requestData.workflow_definition_id)
      .single();

    const workflowName = workflowDef?.name || "Talep";
    const workflowCode = workflowDef?.code || "";

    // Stamp approval ise konu bilgisini al (bildirimde kullanılacak)
    let stampSubject: string | undefined;
    if (workflowCode === 'STAMP_APPROVAL') {
      const { data: stampReq } = await supabase
        .from("stamp_requests")
        .select("subject")
        .eq("request_id", requestData.id)
        .single();
      stampSubject = stampReq?.subject || undefined;
    }

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
        approverName,
        stampSubject
      );
    } else {
      // Onaylandı - sonraki adıma geç veya tamamla
      const { data: allSteps } = await supabase
        .from("workflow_steps")
        .select("phase")
        .eq("workflow_definition_id", requestData.workflow_definition_id);

      // COMPLETION fazında adım var mı? (V4)
      const hasCompletionPhase = allSteps?.some(
        (s: { phase: string }) => s.phase === 'COMPLETION'
      ) || false;

      // Tüm approval kayıtlarını al (sequence_order ile sıralı)
      const { data: allApprovals } = await supabase
        .from("request_approvals")
        .select(`
          id,
          status,
          approver_employee_id,
          sequence_order,
          workflow_step:workflow_steps(step_order, phase, action_type)
        `)
        .eq("request_id", requestData.id)
        .order("sequence_order", { ascending: true });

      const totalApprovalCount = allApprovals?.length || 0;

      // ================================================================
      // Mükerrer onaycı: Bu kişinin ilerideki SIGN_ONLY adımlarını otomatik onayla
      // Onaycı gerçekten onay verdikten sonra, ilerideki sadece-imza adımları da onaylanır
      // ================================================================
      const forwardAutoApproveIds: string[] = [];
      if (allApprovals) {
        const now = new Date().toISOString();
        for (const futureApproval of allApprovals) {
          const futureActionType = Array.isArray(futureApproval.workflow_step)
            ? futureApproval.workflow_step[0]?.action_type
            : (futureApproval.workflow_step as { step_order: number; phase: string; action_type: string } | null)?.action_type;

          if (
            futureApproval.status === 'PENDING' &&
            futureApproval.approver_employee_id === appUser.employee_id &&
            futureActionType === 'SIGN_ONLY' &&
            futureApproval.sequence_order > approval.sequence_order
          ) {
            forwardAutoApproveIds.push(futureApproval.id);
          }
        }

        if (forwardAutoApproveIds.length > 0) {
          const { error: forwardError } = await supabase
            .from("request_approvals")
            .update({
              status: 'APPROVED',
              decided_at: now,
            })
            .in("id", forwardAutoApproveIds);

          if (forwardError) {
            console.error("Error auto-approving forward steps:", forwardError);
          } else {
            console.log(`Auto-approved ${forwardAutoApproveIds.length} forward SIGN_ONLY steps for approver:`, appUser.employee_id);
            // allApprovals içindeki durumları güncelle (nextStep hesabı için)
            for (const a of allApprovals) {
              if (forwardAutoApproveIds.includes(a.id)) {
                a.status = 'APPROVED';
              }
            }
          }
        }
      }

      // Sonraki onaya ilerle — zaten APPROVED olan sequence'leri atla
      let nextStep = approval.sequence_order + 1;

      // Zaten APPROVED olan onayları atla (forward-approve sonucu olabilir)
      while (nextStep <= totalApprovalCount) {
        const seqApproval = allApprovals?.find(
          (a: { sequence_order: number }) => a.sequence_order === nextStep
        );

        if (seqApproval && seqApproval.status === 'APPROVED') {
          console.log(`Sequence ${nextStep} already APPROVED, skipping...`);
          nextStep++;
          continue;
        }

        // PENDING onaya ulaştık, dur
        break;
      }

      const isCompleted = nextStep > totalApprovalCount;

      // ----------------------------------------------------------------
      // V4: APPROVAL fazı tamamlandı mı kontrol et
      // Eğer COMPLETION fazı varsa ve sonraki onayın ait olduğu step
      // COMPLETION fazında ise, tüm APPROVAL adımları bitmiş demektir
      // ----------------------------------------------------------------
      const isEnteringCompletionPhase = !isCompleted && hasCompletionPhase && (() => {
        const nextApprovalData = allApprovals?.find(
          (a: { sequence_order: number }) => a.sequence_order === nextStep
        );
        const nextPhase = Array.isArray(nextApprovalData?.workflow_step)
          ? nextApprovalData?.workflow_step[0]?.phase
          : (nextApprovalData?.workflow_step as { phase: string } | null | undefined)?.phase;
        return nextPhase === 'COMPLETION';
      })();

      // Mevcut request durumu AWAITING_COMPLETION ise ve isCompleted ise → COMPLETED
      const isCompletionFinished = isCompleted && hasCompletionPhase;

      if (isCompleted && !hasCompletionPhase) {
        // ================================================================
        // MEVCUT DAVRANIŞ: Tüm adımlar tamamlandı, COMPLETION fazı yok
        // İzin, avans, işe giriş, ayrılış vb. süreçler buraya düşer
        // ================================================================
        await supabase
          .from("requests")
          .update({
            status: 'APPROVED',
            current_step: totalApprovalCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", requestData.id);

        // PDF oluştur ve Storage'a yükle
        try {
          if (workflowCode === 'STAMP_APPROVAL') {
            // ===== STAMP APPROVAL: Kaşelenmiş PDF oluştur =====
            console.log('Stamp approval completed, generating stamped PDF for request:', requestData.id);

            // stamp_request detaylarını al
            const { data: stampRequest } = await supabase
              .from("stamp_requests")
              .select("*, stamp:stamps(*)")
              .eq("request_id", requestData.id)
              .single();

            if (stampRequest && stampRequest.stamp) {
              // GM'in (onaylayan) imza bilgilerini al
              const { data: gmEmployee } = await supabase
                .from("employees")
                .select("first_name, last_name, signature_text, signature_font")
                .eq("id", appUser.employee_id)
                .single();

              const gmSignatureText = gmEmployee?.signature_text
                || (gmEmployee ? `${gmEmployee.first_name} ${gmEmployee.last_name}` : undefined);

              // Kaşelenmiş PDF oluştur
              const stampedPdfBuffer = await stampPDF({
                originalPdfPath: stampRequest.original_pdf_path,
                stampImagePath: stampRequest.stamp.image_path,
                stampWidth: stampRequest.stamp.width,
                stampHeight: stampRequest.stamp.height,
                stampPosition: stampRequest.stamp_position as StampPosition,
                selectedPages: stampRequest.selected_pages,
                stampXRatio: stampRequest.stamp_x_ratio,
                stampYRatio: stampRequest.stamp_y_ratio,
                stampPositionOverrides: stampRequest.stamp_position_overrides as StampPositionOverrides | null,
                signatureText: gmSignatureText,
                signatureFont: gmEmployee?.signature_font || undefined,
                signatureImageDataUrl: signature_data_url,
              });

              // Kaşelenmiş PDF'i Storage'a yükle
              const supabaseAdmin = createServiceRoleClient();
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const stampedFileName = `stamp_${Date.now()}_stamped.pdf`;
              const stampedPdfPath = `${year}/${month}/${stampedFileName}`;

              const { error: uploadError } = await supabaseAdmin.storage
                .from('request-documents')
                .upload(stampedPdfPath, stampedPdfBuffer, {
                  contentType: 'application/pdf',
                  upsert: false,
                });

              if (uploadError) {
                console.error('Error uploading stamped PDF:', uploadError);
              } else {
                // stamp_requests tablosunda stamped_pdf_path güncelle
                await supabase
                  .from("stamp_requests")
                  .update({ stamped_pdf_path: stampedPdfPath })
                  .eq("id", stampRequest.id);

                // requests tablosunda pdf_path güncelle
                await supabase
                  .from("requests")
                  .update({ pdf_path: stampedPdfPath })
                  .eq("id", requestData.id);

                console.log('Stamped PDF uploaded and saved:', stampedPdfPath);
              }
            } else {
              console.error('Stamp request or stamp not found for request:', requestData.id);
            }
          } else {
            // ===== DİĞER WORKFLOW'LAR: Normal PDF oluştur =====
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
          }
        } catch (pdfError) {
          // PDF oluşturma hatası - loglayalım ama işlemi durdurmayalım
          console.error('Error generating/uploading PDF:', pdfError);
        }

        // Talep edene "onaylandı" bildirimi gönder
        await notifyRequestApproved(
          supabase,
          requestData.requester_employee_id,
          requestData.id,
          workflowName,
          stampSubject
        );

      } else if (isEnteringCompletionPhase) {
        // ================================================================
        // V4: Tüm APPROVAL adımları bitti, COMPLETION fazına geçiliyor
        // Görev formu gibi çok fazlı süreçler buraya düşer
        // ================================================================
        console.log('All APPROVAL steps completed. Entering COMPLETION phase for request:', requestData.id);

        await supabase
          .from("requests")
          .update({
            status: 'AWAITING_COMPLETION',
            current_step: nextStep,
          })
          .eq("id", requestData.id);

        // Onay PDF'i oluştur (gerçekleşen tarihler henüz boş)
        try {
          console.log('Generating approval PDF for request:', requestData.id);
          const pdfBuffer = await generateRequestPDF({
            requestId: requestData.id,
            supabase,
          });

          const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestData.id, supabase);

          const pdfPath = await uploadRequestPDF({
            requestId: requestData.id,
            pdfBuffer: finalPdfBuffer,
          });

          await supabase
            .from("requests")
            .update({ pdf_path: pdfPath })
            .eq("id", requestData.id);

          console.log('Approval phase PDF uploaded:', pdfPath);
        } catch (pdfError) {
          console.error('Error generating approval phase PDF:', pdfError);
        }

        // Talep edene "onaylandı" bildirimi gönder
        await notifyRequestApproved(
          supabase,
          requestData.requester_employee_id,
          requestData.id,
          workflowName,
          stampSubject
        );

        // COMPLETION fazındaki ilk onaycıya bildirim gönder
        const nextApproval = allApprovals?.find(
          (a: { status: string; sequence_order: number }) =>
            a.sequence_order === nextStep && a.status === 'PENDING'
        );

        if (nextApproval) {
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
            workflowName,
            stampSubject
          );
        }

      } else if (isCompletionFinished) {
        // ================================================================
        // V4: COMPLETION fazı da tamamlandı — süreç tamamen bitti
        // ================================================================
        console.log('COMPLETION phase finished. Request fully completed:', requestData.id);

        await supabase
          .from("requests")
          .update({
            status: 'COMPLETED',
            current_step: totalApprovalCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", requestData.id);

        // Final PDF oluştur (gerçekleşen tarihler dolu, üzerine yazar)
        try {
          console.log('Generating final PDF for completed request:', requestData.id);
          const pdfBuffer = await generateRequestPDF({
            requestId: requestData.id,
            supabase,
          });

          const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestData.id, supabase);

          const pdfPath = await uploadRequestPDF({
            requestId: requestData.id,
            pdfBuffer: finalPdfBuffer,
          });

          await supabase
            .from("requests")
            .update({ pdf_path: pdfPath })
            .eq("id", requestData.id);

          console.log('Final PDF uploaded:', pdfPath);
        } catch (pdfError) {
          console.error('Error generating final PDF:', pdfError);
        }

        // Talep edene "tamamlandı" bildirimi gönder
        await notifyRequestApproved(
          supabase,
          requestData.requester_employee_id,
          requestData.id,
          workflowName,
          stampSubject
        );

      } else {
        // ================================================================
        // Henüz bitmedi — sonraki PENDING adıma geç
        // Hem mevcut süreçler hem yeni süreçler bu bloğu kullanır
        // ================================================================
        await supabase
          .from("requests")
          .update({
            current_step: nextStep,
          })
          .eq("id", requestData.id);

        // Sonraki onaycıya bildirim gönder
        const nextApproval = allApprovals?.find(
          (a: { status: string; sequence_order: number }) =>
            a.sequence_order === nextStep && a.status === 'PENDING'
        );

        console.log("Found next approval for sequence", nextStep, ":", nextApproval);

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
            workflowName,
            stampSubject
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

