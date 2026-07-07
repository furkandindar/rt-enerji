import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";
import { generateRequestPDF } from "@/lib/pdf/generate-request-pdf";
import { buildPdfFileName, buildContentDisposition } from "@/lib/pdf/file-naming";
import { authorizePdfAccess } from "@/lib/pdf/authorize-pdf-access";

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

    // 1-3. Kullanıcı + yetki kontrolü (talep sahibi / onaycı / ORG_ADMIN)
    const auth = await authorizePdfAccess(supabase, id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { requestData } = auth;

    // 4. PDF'i o anki veriyle üret (storage'a YAZILMAZ, DB güncellenmez)
    // Render service role ile yapılır: yetki yukarıda doğrulandı ve ORG_ADMIN
    // gibi süreç dışı görüntüleyicilerde RLS nested ilişkileri (imza alanları,
    // workflow detay tabloları) eksik bırakıp PDF'i bozabilir.
    const pdfBuffer = await generateRequestPDF({
      requestId: id,
      supabase: createServiceRoleClient(),
    });
    const body = new Uint8Array(pdfBuffer);

    // 5. İnsan-okur dosya adı
    const wf = requestData.workflow_definition;
    const requester = requestData.requester;
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

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition(fileName, "inline"),
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

// HEAD /api/requests/[id]/pdf/preview-live
// Sadece Content-Disposition header'ı için. PDF üretmez (ucuz).
// PdfViewerDialog dialog açılışında dosya adını öğrenmek için bunu çağırır.
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const auth = await authorizePdfAccess(supabase, id);
    if (!auth.ok) {
      return new NextResponse(null, { status: auth.status });
    }
    const { requestData } = auth;

    const wf = requestData.workflow_definition;
    const requester = requestData.requester;
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
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error in HEAD preview-live:", error);
    return new NextResponse(null, { status: 500 });
  }
}
