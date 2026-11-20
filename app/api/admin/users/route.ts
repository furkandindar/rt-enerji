import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// GET /api/admin/users — "Kullanıcılar ve Roller" ekranı verisi. Yalnız
// users.manage_roles (Admin). Kullanıcı oturumuyla okunur (RLS):
//   - kullanıcılar + çalışan + aktif pozisyonlar (Müdür = aktif birim amiri pozisyonu)
//   - rol kataloğu + izin kataloğu + rol→izin eşlemesi (matris)
//   - son rol değişiklikleri (app_user_role_changes, RLS yalnız users.manage_roles)
// Gizli roller (app_roles.is_hidden — SUPER_ADMIN, geliştirici/sistem hesabı) ve o
// roldeki kullanıcılar, yalnız gizli roldeki kişi bakıyorsa döner: liste, sayılar,
// rol seçenekleri ve rol geçmişi bu hesabı göstermez; yaptığı değişiklikte "Sistem" yazar.
// SQL: sql/feature_roles_1_permissions.sql, sql/feature_super_admin_1_schema.sql

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getUserAccess(supabase);
    if (!access || !can(access, "users.manage_roles")) {
      return NextResponse.json({ error: "Bu ekran yalnız Admin'e açıktır" }, { status: 403 });
    }

    const [usersRes, rolesRes, permsRes, rolePermsRes, changesRes] = await Promise.all([
      supabase
        .from("app_users")
        .select(`
          id,
          email,
          role,
          created_at,
          employee:employees(
            id,
            first_name,
            last_name,
            status,
            employee_positions(
              end_date,
              position:positions(title, is_unit_head, is_active, unit:organizational_units(name))
            )
          )
        `)
        .order("email"),
      supabase.from("app_roles").select("code, label, description, is_member, is_hidden, sort_order").order("sort_order"),
      supabase.from("permissions").select("code, label, description, category, sort_order").order("sort_order"),
      supabase.from("role_permissions").select("role, permission"),
      supabase
        .from("app_user_role_changes")
        .select("id, user_id, user_email, old_role, new_role, changed_by_user_id, changed_by_email, reason, changed_at")
        .order("changed_at", { ascending: false })
        .limit(50),
    ]);

    const firstError = [usersRes, rolesRes, permsRes, rolePermsRes, changesRes].find((r) => r.error)?.error;
    if (firstError) {
      console.error("[admin/users] load failed:", firstError);
      return NextResponse.json({ error: "Kullanıcılar yüklenemedi" }, { status: 500 });
    }

    type PositionRow = {
      end_date: string | null;
      position: { title: string; is_unit_head: boolean; is_active: boolean; unit: { name: string } | null } | null;
    };
    type EmployeeRow = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      status: string | null;
      employee_positions: PositionRow[] | null;
    };
    const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

    const users = (usersRes.data ?? []).map((u) => {
      const emp = one(u.employee as unknown as EmployeeRow | EmployeeRow[] | null);
      const active = (emp?.employee_positions ?? []).filter((ep) => ep.end_date === null && ep.position);
      const positions = active.map((ep) => {
        const pos = one(ep.position)!;
        const unit = one(pos.unit as unknown as { name: string } | { name: string }[] | null);
        return {
          title: pos.title,
          unit_name: unit?.name ?? null,
          is_unit_head: pos.is_unit_head && pos.is_active,
        };
      });
      return {
        id: u.id as string,
        email: u.email as string | null,
        role: u.role as string,
        created_at: u.created_at as string,
        employee_name: emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : null,
        employee_status: emp?.status ?? null,
        positions,
        is_unit_manager: positions.some((p) => p.is_unit_head),
        is_self: u.id === access.user_id,
      };
    });

    // Gizli roller: yalnız gizli roldeki kişi (sistem hesabı) görür.
    const roles = (rolesRes.data ?? []) as { code: string; is_hidden: boolean }[];
    const hiddenRoles = new Set(roles.filter((r) => r.is_hidden).map((r) => r.code));
    const viewerIsHidden = hiddenRoles.has(access.role);
    const hiddenUserIds = new Set(users.filter((u) => hiddenRoles.has(u.role)).map((u) => u.id));

    type ChangeRow = {
      id: string;
      user_id: string;
      user_email: string | null;
      old_role: string | null;
      new_role: string;
      changed_by_user_id: string | null;
      changed_by_email: string | null;
      reason: string | null;
      changed_at: string;
    };
    const changes = ((changesRes.data ?? []) as ChangeRow[])
      .filter(
        (c) =>
          viewerIsHidden ||
          (!hiddenUserIds.has(c.user_id) && !hiddenRoles.has(c.new_role) && !hiddenRoles.has(c.old_role ?? ""))
      )
      .slice(0, 30)
      .map(({ changed_by_user_id, ...c }) => ({
        ...c,
        changed_by_email:
          !viewerIsHidden && changed_by_user_id && hiddenUserIds.has(changed_by_user_id) ? null : c.changed_by_email,
      }));

    return NextResponse.json({
      users: viewerIsHidden ? users : users.filter((u) => !hiddenUserIds.has(u.id)),
      roles: viewerIsHidden ? roles : roles.filter((r) => !r.is_hidden),
      permissions: permsRes.data ?? [],
      role_permissions: (rolePermsRes.data ?? []).filter((rp) => viewerIsHidden || !hiddenRoles.has(rp.role)),
      changes,
    });
  } catch (err) {
    console.error("[admin/users] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
