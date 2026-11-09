"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "cloudeasy.theme") applyTheme(getStoredTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      title="Toggle color theme"
      aria-label="Toggle color theme"
      className={`rounded-md p-2 text-muted hover-surface hover:text-foreground ${className}`}
      onClick={() => applyTheme(getStoredTheme() === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </button>
  );
}
