"use client";

import { CalendarPlus, FileCheck, ClipboardList, Banknote, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavWorkflow() {
  const pathname = usePathname();

  const items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[] = [
    {
      title: "İzin Talebi Oluştur",
      url: "/leave-requests/new",
      icon: CalendarPlus,
    },
    {
      title: "Maaş Avans Talebi",
      url: "/salary-advance/new",
      icon: Banknote,
    },
    {
      title: "Taleplerim",
      url: "/my-requests",
      icon: ClipboardList,
    },
    {
      title: "Bekleyen Onaylar",
      url: "/approvals",
      icon: FileCheck,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Süreç Yönetimi</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
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

