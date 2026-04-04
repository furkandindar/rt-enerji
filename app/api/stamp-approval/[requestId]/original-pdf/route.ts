import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/stamp-approval/[requestId]/original-pdf - Orijinal PDF'i inline görüntüle
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const supabase = await createClient();
    const { requestId } = await params;

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

    // 2. Request ve stamp_request bilgilerini getir
    const supabaseAdmin = createServiceRoleClient();
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from("requests")
      .select(`
        id,
        requester_employee_id,
        stamp_request:stamp_requests(original_pdf_path),
        approvals:request_approvals(approver_employee_id)
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // 3. Yetki kontrolü - Sadece talep sahibi veya onaycılar görebilir
    const isRequester = requestData.requester_employee_id === appUser.employee_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isApprover = requestData.approvals?.some(
      (approval: any) => approval.approver_employee_id === appUser.employee_id
    );

    if (!isRequester && !isApprover) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Original PDF path kontrolü
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stampRequest = requestData.stamp_request as any;
    const originalPdfPath = stampRequest?.original_pdf_path;

    if (!originalPdfPath) {
      return NextResponse.json({ error: "Original PDF not found" }, { status: 404 });
    }

    // 5. Storage'dan orijinal PDF'i indir
    const { data: pdfBlob, error: downloadError } = await supabaseAdmin.storage
      .from("request-documents")
      .download(originalPdfPath);

    if (downloadError || !pdfBlob) {
      console.error("Error downloading original PDF:", downloadError);
      return NextResponse.json({ error: "PDF indirilemedi" }, { status: 500 });
    }

    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error previewing original PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview PDF" },
      { status: 500 }
    );
  }
}

