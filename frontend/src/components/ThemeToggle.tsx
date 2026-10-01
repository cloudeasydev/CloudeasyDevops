import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    const onStorage = () => setTheme(getStoredTheme());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`rounded-md p-2 text-muted hover-surface hover:text-foreground ${className}`}
      onClick={() => {
        const next = getStoredTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
