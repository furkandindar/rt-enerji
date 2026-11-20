"use client";

import { Workflow, type LucideIcon } from "lucide-react";
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

// Süreç Yönetimi — workflows.view (Admin, Yönetici); düzenleme ayrıca workflows.manage.
export function NavWorkflowAdmin() {
  const pathname = usePathname();
  const { can } = useUser();

  if (!can("workflows.view")) {
    return null;
  }

  const items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[] = [
    {
      title: "Süreç Tanımları",
      url: "/workflow-definitions",
      icon: Workflow,
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
