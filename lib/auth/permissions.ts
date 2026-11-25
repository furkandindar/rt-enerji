// Rol + izin modeli — istemci ve sunucu ortak (saf; yan etkisiz).
//
// Yetki rol ADINA değil İZNE bağlıdır. Hangi rolün hangi izne sahip olduğu
// yalnız DB'de tanımlıdır (public.role_permissions); kod rol adı karşılaştırmaz,
// izin sorar: can(access, "requests.view_all"). RLS aynı kuralı
// private.has_permission('<izin>') ile uygular.
// SQL: sql/feature_roles_1_permissions.sql, sql/feature_roles_2_unit_manager_scope.sql,
//      sql/feature_roles_3_role_matrix_v2.sql (Genel Müdür'ün rol tablosu, 2026-11-25)
//
//   ORG_ADMIN    Admin               tüm izinler
//   ORG_MANAGER  Yönetici            tüm izinler − requests.view_all: kendi biriminin
//                                    taleplerini görür (requests.view_unit), görebildiği
//                                    taleplere müdahale eder; rol atamada Admin veremez
//   ORG_IT       Bilgi İşlem Uzmanı  integrations.manage, workflows.view
//   ORG_VIEWER   Kullanıcı           —
//   SUPER_ADMIN  Süper Admin (gizli) tüm izinler; geliştirici/sistem hesabı. Arayüzde
//                listelenmez, arayüzden atanamaz (app_roles.is_hidden).
//   Müdür        rol değil; aktif birim amiri pozisyonundan türetilir — birimi + alt
//                birimlerindeki talepleri salt okunur görür. access.is_unit_manager
//                "birim kapsamı var mı"dır: Müdür VEYA requests.view_unit (yalnız kendi birimi).
// Rol atama: kişi yalnız izinleri kendi izinlerinin alt kümesi olan rolü verebilir ve
// yalnız böyle bir roldeki kişinin rolünü değiştirebilir (DB set_user_role; ekran
// canAssignRole ile aynı kuralı gösterir).

export const PERMISSIONS = [
  "org.manage",
  "stamps.manage",
  "delegations.manage_all",
  "integrations.manage",
  "workflows.view",
  "workflows.manage",
  "workflows.start_any",
  "requests.view_unit",
  "requests.view_all",
  "requests.manage_all",
  "users.manage_roles",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = ["SUPER_ADMIN", "ORG_ADMIN", "ORG_MANAGER", "ORG_IT", "ORG_VIEWER", "NONE"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && (ROLE_CODES as readonly string[]).includes(value);
}

/** İzin taşıyan herhangi bir nesne (sunucu UserAccess, istemci AppUser). */
export interface PermissionHolder {
  permissions: ReadonlySet<string> | readonly string[];
}

/** Oturumdaki kullanıcı bu izne sahip mi. Erişim bilgisi yoksa false (kapalı). */
export function can(holder: PermissionHolder | null | undefined, permission: Permission): boolean {
  if (!holder) return false;
  const perms = holder.permissions;
  return perms instanceof Set ? perms.has(permission) : (perms as readonly string[]).includes(permission);
}

/**
 * Rol atama yükseltme kuralı (DB private.role_within_my_permissions ile aynı): rolün
 * tüm izinleri kişide de varsa o rolü verebilir / o roldeki kişinin rolünü değiştirebilir.
 */
export function canAssignRole(holder: PermissionHolder | null | undefined, rolePermissions: readonly string[]): boolean {
  if (!holder) return false;
  return rolePermissions.every((p) => can(holder, p as Permission));
}

export function toPermissionSet(value: unknown): ReadonlySet<Permission> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.filter((p): p is Permission => typeof p === "string" && (PERMISSIONS as readonly string[]).includes(p))
  );
}
