import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadRequestPDF } from "@/lib/storage/upload-request-pdf";
import { buildPdfFileName, buildContentDisposition } from "@/lib/pdf/file-naming";

// GET /api/requests/[id]/pdf/preview - PDF'i inline görüntüle
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

    // 3. Yetki kontrolü
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
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. İnsan-okur dosya adı (inline gösterilse de "Save as" için isim önemli)
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

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName, "inline"),
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error previewing PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview PDF" },
      { status: 500 }
    );
  }
}

// HEAD /api/requests/[id]/pdf/preview
// Sadece Content-Disposition header'ı için. Storage indirmez (ucuz).
// PdfViewerDialog dialog açılışında dosya adını öğrenmek için bunu çağırır.
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse(null, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("employee_id")
      .eq("id", user.id)
      .single();

    if (!appUser?.employee_id) {
      return new NextResponse(null, { status: 400 });
    }

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
      return new NextResponse(null, { status: 404 });
    }

    const isRequester = requestData.requester_employee_id === appUser.employee_id;
    const isApprover = requestData.approvals?.some(
      (approval: { approver_employee_id: string }) =>
        approval.approver_employee_id === appUser.employee_id
    );

    if (!isRequester && !isApprover) {
      return new NextResponse(null, { status: 403 });
    }

    if (!requestData.pdf_path) {
      return new NextResponse(null, { status: 404 });
    }

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

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName, "inline"),
      },
    });
  } catch (error) {
    console.error("Error in HEAD preview:", error);
    return new NextResponse(null, { status: 500 });
  }
}
