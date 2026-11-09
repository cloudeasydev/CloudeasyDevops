"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Navigate } from "@/lib/navigation";
import { Skeleton } from "@/components/ui/primitives";

export function RequireAuth({ children }: { children: (user: User) => ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User }>("/api/auth/me"),
    retry: false,
  });
  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }
  if (isError || !data?.user) return <Navigate to="/login" replace />;
  return <>{children(data.user)}</>;
}
