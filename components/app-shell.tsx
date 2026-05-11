"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { FxRatesHeader } from "@/components/fx-rates-header";
import { NotificationPopover } from "@/components/notification-popover";
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

// Breadcrumb segment'lerini Türkçe etiketlere eşler. Burada olmayan segment'ler
// (örn. yeni route'lar) düşürülmüş "Title Case" haline gelir.
const BREADCRUMB_LABELS: Record<string, string> = {
  // Genel
  new: "Yeni",
  // Süreçler
  approvals: "Bekleyen Onaylar",
  history: "Onay Geçmişi",
  "my-requests": "Taleplerim",
  "leave-requests": "İzin Talebi",
  "expense-form": "Harcama Formu",
  "comparison-form": "Mukayese Formu",
  "salary-advance": "Maaş Avans Talebi",
  overtime: "Fazla Mesai",
  separation: "Ayrılma",
  "travel-assignment": "Şehir İçi/Dışı Görev Formu",
  "request-form": "Talep Formu",
  "stamp-approval": "Kaşeli Belge Onayı",
  "accounting-approval-cover": "Onay Kapağı Muhasebe",
  "finance-approval-cover": "Onay Kapağı Finans",
  "approval-letter": "Olur Yazısı",
  onboarding: "İşe Giriş",
  // Organizasyon
  employees: "Çalışanlar",
  positions: "Pozisyonlar",
  "position-assignments": "Pozisyon Atamaları",
  "organizational-units": "Organizasyonel Birimler",
  "org-chart": "Organizasyon Şeması",
  // Diğer
  notifications: "Bildirimler",
  profile: "Profil",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatBreadcrumbSegment(segment: string): string {
  // UUID gibi dinamik segment'leri "Detay" olarak göster
  if (UUID_REGEX.test(segment)) return "Detay";
  // Bilinen route'lar için Türkçe etiket
  if (BREADCRUMB_LABELS[segment]) return BREADCRUMB_LABELS[segment];
  // Fallback: tireleri boşluğa çevir + kelime başlarını büyüt
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

                        const label = formatBreadcrumbSegment(segment);

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
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
    </PrivacyConsentGuard>
  );
}

