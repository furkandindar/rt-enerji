"use client";

import { Building, Building2, Briefcase, Layers, type LucideIcon } from "lucide-react";
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

export function NavDictionaries() {
  const pathname = usePathname();
  const { isAdmin } = useUser();

  // Sadece admin kullanıcılar bu menüyü görebilir
  if (!isAdmin) {
    return null;
  }

  const items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[] = [
      {
        title: "Birim Tipleri",
        url: "/unit-types",
        icon: Building2,
      },
      {
        title: "Pozisyon Tipleri",
        url: "/position-types",
        icon: Briefcase,
      },
      {
        title: "Seviye Tipleri",
        url: "/grade-levels",
        icon: Layers,
      },
      {
        title: "Şirketler",
        url: "/companies",
        icon: Building,
      },
    ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sözlük Yönetimi</SidebarGroupLabel>
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

