"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, FileCheck, ClipboardList, Bell, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavWorkflow() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  // Okunmamış bildirim sayısını al
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch("/api/notifications?unread=true");
        if (response.ok) {
          const data = await response.json();
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error("Error fetching notification count:", error);
      }
    };

    fetchUnreadCount();

    // Her 30 saniyede bir güncelle
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const items: {
    title: string;
    url: string;
    icon: LucideIcon;
    badge?: number;
  }[] = [
    {
      title: "İzin Talebi Oluştur",
      url: "/leave-requests/new",
      icon: CalendarPlus,
    },
    {
      title: "Taleplerim",
      url: "/leave-requests",
      icon: ClipboardList,
    },
    {
      title: "Bekleyen Onaylar",
      url: "/approvals",
      icon: FileCheck,
    },
    // {
    //   title: "Bildirimler",
    //   url: "/notifications",
    //   icon: Bell,
    //   badge: unreadCount,
    // },
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
            {item.badge && item.badge > 0 && (
              <SidebarMenuBadge className="bg-red-500 text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

