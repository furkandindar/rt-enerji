import type { SupabaseClient } from "@supabase/supabase-js";
import { can, toPermissionSet, type Permission } from "./permissions";
import type { LifecycleUser } from "@/lib/workflow/lifecycle";

// Sunucu tarafı erişim özeti: tek RPC (public.my_access, SECURITY INVOKER) —
// rol, izinler ve Müdür (birim amiri) bilgisi. Eski
// `app_users.select("employee_id, role")` sorgusunun yerini alır; alan adları
// (employee_id, role) aynı kalır.
// Hata/oturum yoksa null → çağıran 401/400/403 döner (kapalı kalır).

export interface UserAccess {
  user_id: string;
  employee_id: string | null;
  role: string;
  role_label: string;
  permissions: ReadonlySet<Permission>;
  /** Aktif birim amiri pozisyonu var (Müdür kapsamı). */
  is_unit_manager: boolean;
}

export async function getUserAccess(supabase: SupabaseClient): Promise<UserAccess | null> {
  const { data, error } = await supabase.rpc("my_access");
  if (error) {
    console.error("[access] my_access failed:", error);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    user_id: String(d.user_id),
    employee_id: typeof d.employee_id === "string" ? d.employee_id : null,
    role: typeof d.role === "string" ? d.role : "NONE",
    role_label: typeof d.role_label === "string" ? d.role_label : "",
    permissions: toPermissionSet(d.permissions),
    is_unit_manager: d.is_unit_manager === true,
  };
}

/** lib/workflow/lifecycle.ts kuralları için kullanıcı özeti. */
export function lifecycleUser(access: Pick<UserAccess, "employee_id" | "permissions">): LifecycleUser {
  return {
    employeeId: access.employee_id ?? "",
    canManageAll: can(access, "requests.manage_all"),
  };
}
