"use client";

import { type ReactNode } from "react";
import { useUser } from "@/lib/contexts/user-context";
import { Loading } from "@/components/ui/loading";
import { ShieldX } from "lucide-react";

interface AdminPageWrapperProps {
  children: ReactNode;
}

/**
 * Admin-only sayfalar için wrapper component.
 * Sadece ORG_ADMIN rolüne sahip kullanıcılar içeriği görebilir.
 *
 * Kullanım:
 * ```tsx
 * // page.tsx içinde
 * <AdminPageWrapper>
 *   <YourPageContent />
 * </AdminPageWrapper>
 * ```
 */
export function AdminPageWrapper({ children }: AdminPageWrapperProps) {
  const { user, loading, isAdmin } = useUser();

  if (loading) {
    return <Loading fullscreen text="Yetki kontrol ediliyor..." />;
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <AccessDenied message="Giriş yapmanız gerekiyor." />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <AccessDenied />
      </div>
    );
  }

  return <>{children}</>;
}

function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <ShieldX className="h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Erişim Engellendi</h2>
        <p className="text-muted-foreground">
          {message ?? "Bu sayfaya erişim yetkiniz bulunmamaktadır. Sadece yöneticiler erişebilir."}
        </p>
      </div>
    </div>
  );
}

