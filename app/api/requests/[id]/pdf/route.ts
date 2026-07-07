import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";
import { downloadRequestPDF } from "@/lib/storage/upload-request-pdf";
import { buildPdfFileName, buildContentDisposition } from "@/lib/pdf/file-naming";
import { authorizePdfAccess } from "@/lib/pdf/authorize-pdf-access";

// GET /api/requests/[id]/pdf - PDF'i indir
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

    // 6. İnsan-okur dosya adı üret
    // Supabase typegen embedded relations'ı array olarak çıkarır; runtime'da
    // 1:1 ilişki olduğu için object dönebilir → her iki şekle de toleranslı ol.
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
