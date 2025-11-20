"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
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
      const { data, error } = await supabase.auth.getClaims();

      if (!error && data?.claims) {
        const claims = data.claims as any;
        setUser({
          name:
            claims.user_metadata?.full_name ||
            claims.email?.split("@")[0] ||
            "User",
          email: claims.email || "",
          avatar: claims.user_metadata?.avatar_url || "",
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
    return <Loading fullscreen text="Loading..." />;
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
          <div className="ml-auto px-4">
            <ThemeSwitcher />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

