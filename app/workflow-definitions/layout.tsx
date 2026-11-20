"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

// /workflow-definitions — workflows.view. İstemci tarafı guard; sunucu tarafı kontrol page.tsx'te.
export default function WorkflowDefinitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper permission="workflows.view">{children}</AdminPageWrapper>;
}
