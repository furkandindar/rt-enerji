"use client";

import { AdminPageWrapper } from "@/components/admin-page-wrapper";

// /users — users.manage_roles (Admin). Veri yetkisi ayrıca API + RLS'te.
export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPageWrapper permission="users.manage_roles">{children}</AdminPageWrapper>;
}
