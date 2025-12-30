import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// PATCH /api/notifications/[id] - Bildirimi okundu işaretle
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Mevcut kullanıcıyı al
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Bildirimi güncelle (RLS kendi bildirimini kontrol edecek)
    const { data: notification, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating notification:", error);
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json(notification);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

