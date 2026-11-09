"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { getStoredTheme, initTheme, type Theme } from "@/lib/theme";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    initTheme();
    setTheme(getStoredTheme());
    const observer = new MutationObserver(() => setTheme(getStoredTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster theme={theme} position="top-right" richColors />
    </QueryClientProvider>
  );
}
