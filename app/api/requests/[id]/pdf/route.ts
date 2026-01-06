import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadRequestPDF } from "@/lib/storage/upload-request-pdf";

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

    // 2. Request'i getir
    const { data: requestData, error: requestError } = await supabase
      .from("requests")
      .select(`
        *,
        requester_employee_id,
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
      (approval: any) => approval.approver_employee_id === appUser.employee_id
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

    // 6. PDF'i stream olarak döndür
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="talep_${id}.pdf"`,
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

