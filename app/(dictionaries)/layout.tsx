"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

export default function DictionariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper permission="org.manage">{children}</AdminPageWrapper>;
}

