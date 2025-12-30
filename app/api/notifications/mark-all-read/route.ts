import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/notifications/mark-all-read - Tüm bildirimleri okundu işaretle
export async function POST() {
  try {
    const supabase = await createClient();

    // Mevcut kullanıcıyı al
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Tüm okunmamış bildirimleri güncelle
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking notifications as read:", error);
      return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

