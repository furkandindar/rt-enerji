import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadRequestPDF } from "@/lib/storage/upload-request-pdf";
import { buildPdfFileName, buildContentDisposition } from "@/lib/pdf/file-naming";

// GET /api/requests/[id]/pdf - PDF'i indir
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // 1. Kullanıcı kontrolü
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

    // 2. Request'i getir (dosya adı için requester ve workflow code dahil)
    const { data: requestData, error: requestError } = await supabase
      .from("requests")
      .select(`
        id,
        request_no,
        status,
        created_at,
        pdf_path,
        requester_employee_id,
        workflow_definition:workflow_definitions(code),
        requester:employees!requests_requester_employee_id_fkey(first_name, last_name),
        approvals:request_approvals(approver_employee_id)
      `)
      .eq("id", id)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 3. Yetki kontrolü - Sadece talep sahibi veya onaylayanlar görebilir
    const isRequester = requestData.requester_employee_id === appUser.employee_id;
    const isApprover = requestData.approvals?.some(
      (approval: { approver_employee_id: string }) =>
        approval.approver_employee_id === appUser.employee_id
    );

    if (!isRequester && !isApprover) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. PDF path kontrolü
    if (!requestData.pdf_path) {
      return NextResponse.json({ error: "PDF not found for this request" }, { status: 404 });
    }

    // 5. Storage'dan PDF'i indir
    const pdfBlob = await downloadRequestPDF(requestData.pdf_path, supabase);

    // 6. İnsan-okur dosya adı üret
    // Supabase typegen embedded relations'ı array olarak çıkarır; runtime'da
    // 1:1 ilişki olduğu için object dönebilir → her iki şekle de toleranslı ol.
    const wf = requestData.workflow_definition as
      | { code: string }
      | { code: string }[]
      | null;
    const requester = requestData.requester as
      | { first_name: string | null; last_name: string | null }
      | { first_name: string | null; last_name: string | null }[]
      | null;
    const workflowCode = Array.isArray(wf) ? wf[0]?.code : wf?.code;
    const requesterRow = Array.isArray(requester) ? requester[0] : requester;

    const fileName = buildPdfFileName({
      request_no: requestData.request_no,
      workflow_code: workflowCode,
      requester_first_name: requesterRow?.first_name,
      requester_last_name: requesterRow?.last_name,
      status: requestData.status,
      created_at: requestData.created_at,
    });

    // 7. PDF'i stream olarak döndür
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildContentDisposition(fileName, 'attachment'),
      },
    });
  } catch (error) {
    console.error("Error downloading PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download PDF" },
      { status: 500 }
    );
  }
}

