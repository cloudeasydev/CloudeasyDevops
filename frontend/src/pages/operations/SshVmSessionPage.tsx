import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Terminal } from "lucide-react";
import { SshXtermPanel } from "@/components/ssh/SshXtermPanel";
export function SshVmSessionPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId")?.trim() ?? "";
  const label = useMemo(() => params.get("label")?.trim() || "SSH session", [params]);

  if (!sessionId) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050608] p-6 text-center text-zinc-400">
        <p className="mb-4 text-sm">Missing session. Connect again from the SSH Terminal page.</p>
        <Link to="/operations/ssh" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to SSH Terminal
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050608]">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#12151c] px-4 py-2">
        <Terminal className="h-4 w-4 text-indigo-400" />
        <div className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">{label}</div>
        <Link
          to="/operations/ssh"
          className="text-xs text-zinc-500 transition hover:text-zinc-300"
        >
          Portal
        </Link>
      </header>
      <main className="min-h-0 flex-1">
        <SshXtermPanel sessionId={sessionId} label={label} />
      </main>
    </div>
  );
}
