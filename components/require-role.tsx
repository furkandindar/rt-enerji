"use client";

import { type ReactNode } from "react";
import { useUser, type UserRole } from "@/lib/contexts/user-context";
import { Loading } from "@/components/ui/loading";
import { ShieldX } from "lucide-react";

interface RequireRoleProps {
  /** Gerekli rol */
  role: UserRole;
  /** Yetki varsa gösterilecek içerik */
  children: ReactNode;
  /** Yetki yoksa gösterilecek içerik (opsiyonel) */
  fallback?: ReactNode;
  /** Yükleme sırasında gösterilecek içerik (opsiyonel) */
  loadingFallback?: ReactNode;
}

/**
 * Rol bazlı erişim kontrolü sağlayan wrapper component.
 * Kullanıcının belirtilen role sahip olup olmadığını kontrol eder.
 *
 * @example
 * ```tsx
 * <RequireRole role="ORG_ADMIN">
 *   <AdminPanel />
 * </RequireRole>
 *
 * // Özel fallback ile
 * <RequireRole
 *   role="ORG_ADMIN"
 *   fallback={<p>Yetkiniz yok</p>}
 * >
 *   <AdminPanel />
 * </RequireRole>
 * ```
 */
export function RequireRole({
  role,
  children,
  fallback,
  loadingFallback,
}: RequireRoleProps) {
  const { user, loading, hasRole } = useUser();

  // Yükleme durumu
  if (loading) {
    return loadingFallback ?? <Loading text="Yetki kontrol ediliyor..." />;
  }

  // Kullanıcı giriş yapmamış
  if (!user) {
    return fallback ?? <AccessDenied message="Giriş yapmanız gerekiyor." />;
  }

  // Yetki kontrolü
  if (!hasRole(role)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}

// Varsayılan erişim engeli componenti
function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <ShieldX className="h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Erişim Engellendi</h2>
        <p className="text-muted-foreground">
          {message ?? "Bu sayfaya erişim yetkiniz bulunmamaktadır."}
        </p>
      </div>
    </div>
  );
}

/**
 * Sadece admin kullanıcılar için kısayol component.
 *
 * @example
 * ```tsx
 * <RequireAdmin>
 *   <AdminSettings />
 * </RequireAdmin>
 * ```
 */
export function RequireAdmin({
  children,
  fallback,
  loadingFallback,
}: Omit<RequireRoleProps, "role">) {
  return (
    <RequireRole
      role="ORG_ADMIN"
      fallback={fallback}
      loadingFallback={loadingFallback}
    >
      {children}
    </RequireRole>
  );
}

