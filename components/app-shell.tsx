"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { NotificationPopover } from "@/components/notification-popover";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { createClient } from "@/lib/supabase/client";
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

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthRoute = pathname.startsWith("/auth");

  useEffect(() => {
    if (isAuthRoute) {
      setLoading(false);
      return;
    }

    const getUser = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();

      if (authData?.user) {
        const authUser = authData.user;

        // app_users -> employees ilişkisinden ad soyad bilgisini çek
        const { data: appUserData } = await supabase
          .from("app_users")
          .select("employee_id, employees(first_name, last_name)")
          .eq("id", authUser.id)
          .single();

        const employeeData = appUserData?.employees;
        const employee = Array.isArray(employeeData) ? employeeData[0] : employeeData;
        const fullName = employee
          ? `${employee.first_name} ${employee.last_name}`
          : authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User";

        setUser({
          name: fullName,
          email: authUser.email || "",
          avatar: authUser.user_metadata?.avatar_url || "",
        });
      }

      setLoading(false);
    };

    getUser();
  }, [isAuthRoute]);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return <Loading fullscreen text="Yükleniyor..." />;
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
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
                    <BreadcrumbPage>Home</BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="/">Home</BreadcrumbLink>
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
            <NotificationPopover />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

