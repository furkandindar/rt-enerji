"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

// /workflow-definitions — ORG_ADMIN. İstemci tarafı guard; sunucu tarafı kontrol page.tsx'te.
export default function WorkflowDefinitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper>{children}</AdminPageWrapper>;
}
