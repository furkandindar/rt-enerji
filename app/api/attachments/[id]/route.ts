import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// DELETE /api/attachments/[id] - Dosya sil
export async function DELETE(
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

    // 2. Attachment kaydını getir
    const { data: attachment, error: fetchError } = await supabase
      .from("request_attachments")
      .select("*, request:requests(status, current_step)")
      .eq("id", id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // 3. Yetki kontrolü - sadece yükleyen kişi silebilir
    if (attachment.uploaded_by !== appUser.employee_id) {
      return NextResponse.json({ error: "Bu dosyayı silme yetkiniz yok" }, { status: 403 });
    }

    // 4. İlgili adım henüz PENDING mi kontrol et
    const { data: approvalCheck } = await supabase
      .from("request_approvals")
      .select("status")
      .eq("request_id", attachment.request_id)
      .eq("approver_employee_id", appUser.employee_id)
      .single();

    if (approvalCheck && approvalCheck.status !== "PENDING") {
      return NextResponse.json({ error: "Onaylanmış adımdaki dosya silinemez" }, { status: 400 });
    }

    // 5. Storage'dan sil
    const { error: storageError } = await supabase.storage
      .from("workflow-attachments")
      .remove([attachment.file_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      return NextResponse.json({ error: "Dosya storage'dan silinemedi" }, { status: 500 });
    }

    // 6. Veritabanından sil
    const { error: deleteError } = await supabase
      .from("request_attachments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("DB delete error:", deleteError);
      return NextResponse.json({ error: "Dosya kaydı silinemedi" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

