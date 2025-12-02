"use client";

import { Network, Briefcase, Users, UserCheck, GitBranch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavOrganization() {
  const pathname = usePathname();

  const items: {
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
      title: "Organizasyon Şeması",
      url: "/org-chart",
      icon: GitBranch,
    },
  ];

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

