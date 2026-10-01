import { Link, useOutletContext } from "react-router-dom";
import { FolderKanban, Globe, KeyRound, Webhook, Zap } from "lucide-react";
import type { User } from "@/lib/api";
import { Card } from "@/components/ui/primitives";

export function HomePage() {
  const { user } = useOutletContext<{ user: User }>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="page-desc mt-1">Projects, secrets, network tools, and API testing — in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { to: "/projects", label: "My Projects", icon: FolderKanban, hint: "Open your assigned work" },
          { to: "/secrets", label: "Secrets", icon: KeyRound, hint: "Name + value cards" },
          { to: "/network", label: "Network", icon: Globe, hint: "Ping · DNS · SSL" },
          { to: "/api-studio", label: "API Studio", icon: Webhook, hint: "Test APIs and cURL" },
          { to: "/quick-access", label: "Quick Access", icon: Zap, hint: "GitHub and links" },
        ].map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="h-full transition hover:border-accent/40">
              <s.icon className="h-4 w-4 text-accent-text" />
              <div className="mt-3 font-medium">{s.label}</div>
              <div className="text-xs text-muted">{s.hint}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
