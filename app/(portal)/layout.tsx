"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{(user) => <AppLayout user={user}>{children}</AppLayout>}</RequireAuth>;
}
