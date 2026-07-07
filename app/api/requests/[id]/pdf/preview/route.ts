import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";
import { downloadRequestPDF } from "@/lib/storage/upload-request-pdf";
import { buildPdfFileName, buildContentDisposition } from "@/lib/pdf/file-naming";
import { authorizePdfAccess } from "@/lib/pdf/authorize-pdf-access";

// GET /api/requests/[id]/pdf/preview - PDF'i inline görüntüle
export async function GET(
  request: Request,
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

    // 4. PDF path kontrolü
    if (!requestData.pdf_path) {
      return NextResponse.json({ error: "PDF not found for this request" }, { status: 404 });
    }

    // 5. Storage'dan PDF'i indir
    // Yetki yukarıda uygulama seviyesinde doğrulandı; storage bucket
    // politikası ORG_ADMIN'i kapsamadığı için indirme service role ile yapılır.
    const pdfBlob = await downloadRequestPDF(
      requestData.pdf_path,
      createServiceRoleClient()
    );
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. İnsan-okur dosya adı (inline gösterilse de "Save as" için isim önemli)
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

    const auth = await authorizePdfAccess(supabase, id);
    if (!auth.ok) {
      return new NextResponse(null, { status: auth.status });
    }
    const { requestData } = auth;

    if (!requestData.pdf_path) {
      return new NextResponse(null, { status: 404 });
    }

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
      },
    });
  } catch (error) {
    console.error("Error in HEAD preview:", error);
    return new NextResponse(null, { status: 500 });
  }
}
