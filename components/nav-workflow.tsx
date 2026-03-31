"use client";

import { CalendarPlus, FileCheck, ClipboardList, Banknote, Clock, UserPlus, UserMinus, FileText, type LucideIcon } from "lucide-react";
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

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  // Boş bırakılırsa her zaman görünür.
  // Dolu ise kullanıcının bu kodlardan en az birine erişimi olmalı.
  workflowCodes?: string[];
  // Departman grubu başlığı — aynı group değerine sahip itemlar bir arada gösterilir.
  group?: string;
}

// Her zaman görünen bireysel süreçler
const personalItems: NavItem[] = [
  { title: "İzin Talebi", url: "/leave-requests/new", icon: CalendarPlus },
  { title: "Maaş Avans Talebi",   url: "/salary-advance/new", icon: Banknote },
  { title: "Talep Formu",         url: "/request-form/new",   icon: FileText },
];

// Departmana özel kısıtlı süreçler
const departmentItems: NavItem[] = [
  { title: "Fazla Mesai Formu",    url: "/overtime/new",   icon: Clock,    workflowCodes: ["OVERTIME"],           group: "İnsan Kaynakları" },
  { title: "İşe Giriş Takip Formu", url: "/onboarding/new", icon: UserPlus, workflowCodes: ["EMPLOYEE_ONBOARDING"], group: "İnsan Kaynakları" },
  { title: "İşten Çıkış Takip Formu", url: "/separation/new", icon: UserMinus, workflowCodes: ["EMPLOYEE_SEPARATION"], group: "İnsan Kaynakları" },
];

// Her zaman görünen takip ekranları
const trackingItems: NavItem[] = [
  { title: "Taleplerim",      url: "/my-requests", icon: ClipboardList },
  { title: "Bekleyen Onaylar", url: "/approvals",   icon: FileCheck },
];

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <>
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
    </>
  );
}

export function NavWorkflow() {
  const pathname = usePathname();
  const { user } = useUser();

  const availableCodes = user?.availableWorkflowCodes ?? [];

  // Kullanıcının erişimi olan departman item'larını bul
  const accessibleDepartmentItems = departmentItems.filter((item) =>
    item.workflowCodes?.some((code) => availableCodes.includes(code))
  );

  // Erişilebilir departman gruplarını belirle (başlıklar için)
  const departmentGroups = [...new Set(accessibleDepartmentItems.map((item) => item.group!))];

  return (
    <>
      {/* Bireysel Süreçler — herkes görür */}
      <SidebarGroup>
        <SidebarGroupLabel>Bireysel Süreçler</SidebarGroupLabel>
        <SidebarMenu>
          <NavItems items={personalItems} pathname={pathname} />
        </SidebarMenu>
      </SidebarGroup>

      {/* Departman Süreçleri — sadece yetkili kullanıcılar görür */}
      {departmentGroups.map((group) => {
        const groupItems = accessibleDepartmentItems.filter((item) => item.group === group);
        return (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarMenu>
              <NavItems items={groupItems} pathname={pathname} />
            </SidebarMenu>
          </SidebarGroup>
        );
      })}

      {/* Takip — herkes görür */}
      <SidebarGroup>
        <SidebarGroupLabel>Takip</SidebarGroupLabel>
        <SidebarMenu>
          <NavItems items={trackingItems} pathname={pathname} />
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

