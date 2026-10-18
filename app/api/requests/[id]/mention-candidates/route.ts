import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { listMentionCandidates } from "@/lib/workflow/mentions";

// GET /api/requests/[id]/mention-candidates
// @mention seçicisinin aday listesi: bu talebi zaten görebilen, aktif ve sistem
// hesabı bağlı çalışanlar (kendisi hariç). Talebi göremeyen kullanıcı listeyi de
// alamaz (RLS ile 404). Sunucu anmaları kaydederken aynı kuralı yeniden uygular;
// bu liste yalnız seçim kolaylığıdır.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: requestId } = await params;

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

    // Yetki: talep kullanıcının RLS'ine görünür mü?
    const { data: visible } = await supabase
      .from("requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (!visible) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const candidates = await listMentionCandidates(requestId, appUser.employee_id);
    return NextResponse.json(candidates);
  } catch (err) {
    console.error("[mention-candidates] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
