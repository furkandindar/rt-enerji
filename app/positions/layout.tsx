"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

export default function PositionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper>{children}</AdminPageWrapper>;
}

