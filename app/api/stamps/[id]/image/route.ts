import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/stamps/[id]/image - Aktif bir kaşenin görselini inline döndürür.
// Kaşeli belge onayı oluşturma formunda picker bileşeni için kullanılır.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const { data: stamp, error: stampError } = await supabaseAdmin
      .from("stamps")
      .select("image_path, is_active")
      .eq("id", id)
      .single();

    if (stampError || !stamp) {
      return NextResponse.json({ error: "Stamp not found" }, { status: 404 });
    }

    if (!stamp.is_active) {
      return NextResponse.json({ error: "Stamp inactive" }, { status: 404 });
    }

    // DB'deki image_path "/stamps/X.png" veya "stamps/X.png" olarak kaydediliyor;
    // .from('stamps') zaten bucket'ı belirttiği için prefix'i ayıklıyoruz.
    let stampFileKey = stamp.image_path as string;
    if (stampFileKey.startsWith("/")) {
      stampFileKey = stampFileKey.slice(1);
    }
    if (stampFileKey.startsWith("stamps/")) {
      stampFileKey = stampFileKey.slice("stamps/".length);
    }

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from("stamps")
      .download(stampFileKey);

    if (downloadError || !blob) {
      console.error("Error downloading stamp image:", downloadError);
      return NextResponse.json({ error: "Kaşe görseli indirilemedi" }, { status: 500 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": blob.type || "image/png",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error fetching stamp image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stamp image" },
      { status: 500 }
    );
  }
}
