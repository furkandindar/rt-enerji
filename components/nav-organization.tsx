"use client";

import { Network, Briefcase, Users, UserCheck, GitBranch, Handshake, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useUser } from "@/lib/contexts/user-context";
import type { Permission } from "@/lib/auth/permissions";

export function NavOrganization() {
  const pathname = usePathname();
  const { can } = useUser();

  // İzne bağlı yönetim sayfaları (lib/auth/permissions.ts) + herkese açık sayfalar.
  // null izin = herkes görür.
  const allItems: {
    title: string;
    url: string;
    icon: LucideIcon;
    permission: Permission | null;
  }[] = [
    { title: "Birimler", url: "/organizational-units", icon: Network, permission: "org.manage" },
    { title: "Pozisyonlar", url: "/positions", icon: Briefcase, permission: "org.manage" },
    { title: "Çalışanlar", url: "/employees", icon: Users, permission: "org.manage" },
    { title: "Pozisyon Atamaları", url: "/position-assignments", icon: UserCheck, permission: "org.manage" },
    { title: "Vekaletler", url: "/delegations", icon: Handshake, permission: "delegations.manage_all" },
    { title: "Kullanıcılar ve Roller", url: "/users", icon: ShieldCheck, permission: "users.manage_roles" },
    { title: "Organizasyon Şeması", url: "/org-chart", icon: GitBranch, permission: null },
  ];

  const items = allItems.filter((item) => item.permission === null || can(item.permission));

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Organizasyon Birimleri</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={pathname === item.url}>
              <Link href={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

