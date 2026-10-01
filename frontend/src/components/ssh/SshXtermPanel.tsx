import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "@/lib/api";

type Props = {
  sessionId: string;
  label: string;
  onDisconnected?: () => void;
  onError?: (message: string) => void;
};

export function SshXtermPanel({ sessionId, label, onDisconnected, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 13,
      theme: {
        background: "#050608",
        foreground: "#e4e4e7",
        cursor: "#a5b4fc",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    term.writeln(`\x1b[1;36mCloudEasy SSH\x1b[0m → ${label}`);
    term.writeln("");

    termRef.current = term;
    fitRef.current = fit;

    const path = `/api/ssh-terminal/ws?sessionId=${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(wsUrl(path));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      const sendResize = () => {
        fit.fit();
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      };
      sendResize();
      const ro = new ResizeObserver(() => sendResize());
      ro.observe(el);
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data) as { type?: string; message?: string };
          if (msg.type === "error") {
            onError?.(msg.message ?? "SSH error");
            term.writeln(`\r\n\x1b[31m${msg.message ?? "Connection failed"}\x1b[0m`);
            return;
          }
          if (msg.type === "status") return;
        } catch {
          term.write(ev.data);
        }
        return;
      }
      const buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array(ev.data as ArrayBuffer);
      term.write(buf);
    };

    ws.onerror = () => onError?.("WebSocket error");
    ws.onclose = () => {
      term.writeln("\r\n\x1b[33m[session closed]\x1b[0m");
      onDisconnected?.();
    };

    return () => {
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [sessionId, label, onDisconnected, onError]);

  return <div ref={hostRef} className="h-full min-h-[min(70vh,720px)] w-full p-1" />;
}
