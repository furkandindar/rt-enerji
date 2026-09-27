import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveActingRights } from "@/lib/workflow/delegation";

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
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    // 3. Yetki kontrolü - sadece yükleyen kişi silebilir
    if (attachment.uploaded_by !== appUser.employee_id) {
      return NextResponse.json({ error: "Bu dosyayı silme yetkiniz yok" }, { status: 403 });
    }

    // 4. Silme penceresi:
    //    a) Talep sahibi, talep düzenlenebilirken (DRAFT / REVISION_REQUESTED) —
    //       revize akışında ek güncelleme.
    //    b) Aksi halde talep canlı olmalı ve ekin ait olduğu adımda, aktif cycle'da
    //       kullanıcının işlem yapabildiği (kendisi veya vekaleten) PENDING bir satır
    //       bulunmalı — imzası atılmış adımın eki silinemez.
    const { data: req } = await supabase
      .from("requests")
      .select("status, requester_employee_id, current_revision_cycle")
      .eq("id", attachment.request_id)
      .single();

    if (!req) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    }

    const isEditingRequester =
      req.requester_employee_id === appUser.employee_id &&
      (req.status === "DRAFT" || req.status === "REVISION_REQUESTED");

    if (!isEditingRequester) {
      const isLive = req.status === "PENDING" || req.status === "AWAITING_COMPLETION";

      const { data: config } = await supabase
        .from("workflow_step_attachments")
        .select("workflow_step_id")
        .eq("id", attachment.step_attachment_config_id)
        .single();

      const { data: pendingRows } = config && isLive
        ? await supabase
            .from("request_approvals")
            .select("id, approver_employee_id")
            .eq("request_id", attachment.request_id)
            .eq("workflow_step_id", config.workflow_step_id)
            .eq("revision_cycle", req.current_revision_cycle ?? 0)
            .eq("status", "PENDING")
        : { data: [] as { id: string; approver_employee_id: string }[] };

      let canAct = false;
      for (const row of pendingRows ?? []) {
        const rights = await resolveActingRights(
          supabase,
          row.id,
          row.approver_employee_id,
          appUser.employee_id
        );
        if (rights.canAct) {
          canAct = true;
          break;
        }
      }

      if (!canAct) {
        return NextResponse.json({ error: "Onaylanmış adımdaki dosya silinemez" }, { status: 400 });
      }
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

