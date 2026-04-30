import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateRequestPDF } from "@/lib/pdf/generate-request-pdf";

// GET /api/requests/[id]/pdf/preview-live
// Süreç içindeki bir talep için o anki haliyle PDF üretir.
// Storage'a yazılmaz, DB'ye yazılmaz; her istek render eder.
export async function GET(
  _request: Request,
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

    // 2. Request'i getir (yetki kontrolü için minimal alanlar)
    const { data: requestData, error: requestError } = await supabase
      .from("requests")
      .select(`
        id,
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
      (approval: { approver_employee_id: string }) =>
        approval.approver_employee_id === appUser.employee_id
    );

    if (!isRequester && !isApprover) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. PDF'i o anki veriyle üret (storage'a YAZILMAZ, DB güncellenmez)
    const pdfBuffer = await generateRequestPDF({ requestId: id, supabase });
    const body = new Uint8Array(pdfBuffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Content-Length": body.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating live PDF preview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate preview" },
      { status: 500 }
    );
  }
}
