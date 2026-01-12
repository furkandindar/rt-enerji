"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

export default function OrganizationalUnitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper>{children}</AdminPageWrapper>;
}

