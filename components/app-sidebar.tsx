"use client"

import * as React from "react"
import Image from "next/image"

import { NavDictionaries } from "@/components/nav-dictionaries"
import { NavOrganization } from "@/components/nav-organization"
import { NavWorkflow } from "@/components/nav-workflow"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type AppUser = {
  name: string;
  email: string;
  avatar: string;
};

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user?: AppUser }) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="cursor-default"
              tooltip="RT Enerji"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                <Image
                  src="/logo.png"
                  alt="RT Enerji logo"
                  width={20}
                  height={20}
                  className="h-5 w-5 dark:hidden"
                />
                <Image
                  src="/rt_logo_white.png"
                  alt="RT Enerji logo white"
                  width={16}
                  height={16}
                  className="hidden h-5 w-5 dark:block"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">RT Enerji</span>
                <span className="truncate text-xs text-muted-foreground">Organizasyon Yönetimi</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* <NavMain items={data.navMain} /> */}
        {/* <NavProjects projects={data.projects} /> */}
        <NavWorkflow />
        <NavDictionaries />
        <NavOrganization />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
