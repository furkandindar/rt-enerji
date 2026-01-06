import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { uploadSignature, deleteSignature } from "@/lib/storage/upload-signature";

// POST /api/profile/signature - İmza yükle
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { signatureDataUrl } = await request.json();

    // Kullanıcının employee_id'sini al
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

    // İmzayı yükle
    const filePath = await uploadSignature({
      employeeId: appUser.employee_id,
      signatureDataUrl,
      supabase,
    });

    // Database'i güncelle
    const { error: updateError } = await supabase
      .from("employees")
      .update({ signature_path: filePath })
      .eq("id", appUser.employee_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: filePath });
  } catch (error: any) {
    console.error("Error uploading signature:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/profile/signature - İmza sil
export async function DELETE() {
  try {
    const supabase = await createClient();

    // Kullanıcının employee_id'sini al
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

    // İmzayı sil
    await deleteSignature(appUser.employee_id, supabase);

    // Database'i güncelle
    const { error: updateError } = await supabase
      .from("employees")
      .update({ signature_path: null })
      .eq("id", appUser.employee_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting signature:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

