import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isRoleCode } from "@/lib/auth/permissions";

// PATCH /api/admin/users/[id]/role  { role, reason? }
// Rol atama tek kapıdan: public.set_user_role() (SECURITY DEFINER). Yetki
// (users.manage_roles), "kendi rolünü değiştiremez", yükseltme koruması (yalnız kendi
// izinlerini aşmayan rol; Yönetici Admin veremez/değiştiremez) ve rol doğrulaması
// fonksiyonun içinde; denetim kaydını trigger yazar (çağıran = auth.uid()). Bu yüzden
// kullanıcı oturumuyla çağrılır — service role ile çağrılırsa yetki kontrolü geçmez.
// SQL: sql/feature_roles_1_permissions.sql, sql/feature_roles_3_role_matrix_v2.sql

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Geçersiz kullanıcı" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { role?: unknown; reason?: unknown } | null;
    const role = body?.role;
    if (!isRoleCode(role)) {
      return NextResponse.json({ error: "Geçersiz rol" }, { status: 400 });
    }
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const { error } = await supabase.rpc("set_user_role", {
      p_user_id: id,
      p_role: role,
      p_reason: reason || null,
    });

    if (error) {
      const status =
        error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.code === "P0002" ? 404 : 500;
      if (status === 500) console.error("[admin/users/role] set_user_role failed:", error);
      return NextResponse.json(
        { error: status === 500 ? "Rol değiştirilemedi" : error.message },
        { status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/role] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
