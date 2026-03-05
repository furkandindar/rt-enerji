import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/attachments/[id]/download - Dosya indir (signed URL ile yönlendir)
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

    // 2. Attachment kaydını getir (RLS zaten yetki kontrolü yapıyor)
    const { data: attachment, error: fetchError } = await supabase
      .from("request_attachments")
      .select("file_path, file_name, mime_type")
      .eq("id", id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // 3. Signed URL oluştur (1 saat geçerli)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("workflow-attachments")
      .createSignedUrl(attachment.file_path, 3600);

    if (urlError || !signedUrlData) {
      console.error("Signed URL error:", urlError);
      return NextResponse.json({ error: "İndirme linki oluşturulamadı" }, { status: 500 });
    }

    return NextResponse.redirect(signedUrlData.signedUrl);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

