"use client";

import { Network, Briefcase, Users, UserCheck, GitBranch, Handshake, type LucideIcon } from "lucide-react";
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

export function NavOrganization() {
  const pathname = usePathname();
  const { isAdmin } = useUser();

  // Admin-only sayfalar
  const adminItems: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[] = [
      {
        title: "Birimler",
        url: "/organizational-units",
        icon: Network,
      },
      {
        title: "Pozisyonlar",
        url: "/positions",
        icon: Briefcase,
      },
      {
        title: "Çalışanlar",
        url: "/employees",
        icon: Users,
      },
      {
        title: "Pozisyon Atamaları",
        url: "/position-assignments",
        icon: UserCheck,
      },
      {
        title: "Vekaletler",
        url: "/delegations",
        icon: Handshake,
      },
    ];

  // Herkesin görebileceği sayfalar
  const publicItems: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[] = [
      {
        title: "Organizasyon Şeması",
        url: "/org-chart",
        icon: GitBranch,
      },
    ];

  // Admin ise tüm itemları, değilse sadece public olanları göster
  const items = isAdmin ? [...adminItems, ...publicItems] : publicItems;

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

