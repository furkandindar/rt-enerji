"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { FxRatesHeader } from "@/components/fx-rates-header";
import { NotificationPopover } from "@/components/notification-popover";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserProvider, useUser } from "@/lib/contexts/user-context";
import { useNotificationSubscription } from "@/hooks/use-notification-subscription";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Loading } from "./ui/loading";
import { PrivacyConsentGuard } from "./privacy-consent-guard";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/auth");

  // Auth route'ları için provider gereksiz
  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <UserProvider>
      <AppShellContent>{children}</AppShellContent>
    </UserProvider>
  );
}

// İç component: UserContext'e erişebilir
function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useUser();

  // Realtime notification subscription
  useNotificationSubscription(user?.id ?? null);

  if (loading) {
    return <Loading fullscreen text="Yükleniyor..." />;
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <PrivacyConsentGuard>
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {pathname === "/" ? (
                  <BreadcrumbItem>
                    <BreadcrumbPage>Ana Sayfa</BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="/">Ana Sayfa</BreadcrumbLink>
                    </BreadcrumbItem>
                    {pathname
                      .split("/")
                      .filter(Boolean)
                      .map((segment, index, arr) => {
                        const segmentPath =
                          "/" + arr.slice(0, index + 1).join("/");

                        const label =
                          segment.charAt(0).toUpperCase() + segment.slice(1);

                        const isLast = index === arr.length - 1;

                        return (
                          <div key={segmentPath} className="flex items-center">
                            <BreadcrumbSeparator className="hidden md:block" />
                            <BreadcrumbItem>
                              {isLast ? (
                                <BreadcrumbPage>{label}</BreadcrumbPage>
                              ) : (
                                <BreadcrumbLink href={segmentPath}>
                                  {label}
                                </BreadcrumbLink>
                              )}
                            </BreadcrumbItem>
                          </div>
                        );
                      })}
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            <FxRatesHeader />
            <NotificationPopover />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </PrivacyConsentGuard>
  );
}

