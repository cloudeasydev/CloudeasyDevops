import { Router } from "express";
import { Client, type ClientChannel } from "ssh2";
import type { Server } from "node:http";
import { parseCookie } from "cookie";
import { WebSocketServer } from "ws";
import { env } from "../../config/env.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { resolveSession } from "../../lib/session.js";
import { normalizePrivateKey } from "./keys.js";
import {
  assertSshTerminalRateLimit,
  clientIpFromHttp,
  consumeSshTerminalSession,
  createSshTerminalSession,
  SSH_SESSION_TTL_SEC,
  sshConnectSchema,
  sshSessionBindHash,
} from "./session.js";

export const sshTerminalRouter = Router();

sshTerminalRouter.post(
  "/sessions",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    await assertSshTerminalRateLimit(req.user!.id);
    const parsed = sshConnectSchema.parse(req.body);
    const hasPassword = Boolean(parsed.password?.length);
    const hasKey = Boolean(parsed.privateKey?.trim().length);

    if (parsed.authMode === "password" && !hasPassword) {
      throw new AppError(400, "Password is required for password authentication", "BAD_REQUEST");
    }
    if (parsed.authMode === "privateKey" && !hasKey) {
      throw new AppError(400, "Private key is required for key authentication", "BAD_REQUEST");
    }
    if (parsed.authMode === "both" && (!hasPassword || !hasKey)) {
      throw new AppError(400, "Both password and private key are required for combined mode", "BAD_REQUEST");
    }

    let privateKey: string | undefined;
    if (hasKey && parsed.privateKey) {
      privateKey = await normalizePrivateKey(parsed.privateKey, parsed.keyPassphrase);
    }

    const clientIp = req.ip ?? clientIpFromHttp(req);
    const authSessionId = req.sessionRow!.id;
    const bindHash = sshSessionBindHash(req.user!.id, authSessionId, clientIp);

    const sessionId = await createSshTerminalSession(
      {
        userId: req.user!.id,
        host: parsed.host.trim(),
        port: parsed.port,
        username: parsed.username.trim(),
        password: parsed.password,
        privateKey,
        keyPassphrase: parsed.keyPassphrase,
        authMode: parsed.authMode,
      },
      bindHash,
      authSessionId,
    );

    await writeAudit({
      req,
      action: "ssh.terminal.session",
      resource: "server",
      metadata: { host: parsed.host, port: parsed.port, username: parsed.username, authMode: parsed.authMode },
    });

    res.status(201).json({
      sessionId,
      expiresIn: SSH_SESSION_TTL_SEC,
      wsPath: `/api/ssh-terminal/ws?sessionId=${sessionId}`,
    });
  }),
);

export function attachSshTerminalWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== "/api/ssh-terminal/ws") return;

    void (async () => {
      try {
        const cookies = parseCookie(request.headers.cookie ?? "");
        const token = cookies[env.SESSION_COOKIE_NAME];
        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const auth = await resolveSession(token);
        if (!auth) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        const sessionId = url.searchParams.get("sessionId")?.trim();
        if (!sessionId) {
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        const clientIp = clientIpFromHttp(request);
        const bindHash = sshSessionBindHash(auth.user.id, auth.sessionId, clientIp);
        const cfg = await consumeSshTerminalSession(sessionId, auth.user.id, bindHash, auth.sessionId);
        if (!cfg) {
          socket.write("HTTP/1.1 410 Gone\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const conn = new Client();
          let shellStream: ClientChannel | null = null;

          const fail = (message: string) => {
            try {
              ws.send(JSON.stringify({ type: "error", message }));
            } catch {
              /* ignore */
            }
            ws.close();
            conn.end();
          };

          conn
            .on("ready", () => {
              conn.shell({ term: "xterm-256color", cols: 120, rows: 32 }, (err: Error | undefined, stream) => {
                if (err) {
                  fail(err.message);
                  return;
                }
                shellStream = stream;
                ws.send(JSON.stringify({ type: "status", message: "connected" }));
                stream.on("data", (data: Buffer) => {
                  if (ws.readyState === ws.OPEN) ws.send(data);
                });
                stream.on("close", () => ws.close());
              });
            })
            .on("error", (err: Error) => fail(err.message))
            .on("close", () => {
              if (ws.readyState === ws.OPEN) ws.close();
            });

          ws.on("message", (raw) => {
            const data = typeof raw === "string" ? raw : raw.toString("utf8");
            if (data.startsWith("{")) {
              try {
                const msg = JSON.parse(data) as { type?: string; cols?: number; rows?: number };
                if (msg.type === "resize" && shellStream && msg.cols && msg.rows) {
                  shellStream.setWindow(msg.rows, msg.cols, 0, 0);
                }
                return;
              } catch {
                /* treat as input */
              }
            }
            shellStream?.write(data);
          });

          ws.on("close", () => {
            shellStream?.close();
            conn.end();
          });

          const connectConfig: import("ssh2").ConnectConfig = {
            host: cfg.host,
            port: cfg.port,
            username: cfg.username,
            readyTimeout: 20_000,
          };

          if (cfg.privateKey) {
            connectConfig.privateKey = cfg.privateKey;
            if (cfg.keyPassphrase) connectConfig.passphrase = cfg.keyPassphrase;
          }
          if (cfg.password) connectConfig.password = cfg.password;

          if (cfg.authMode === "privateKey") {
            connectConfig.tryKeyboard = false;
          } else {
            connectConfig.tryKeyboard = true;
          }

          conn.connect(connectConfig);
        });
      } catch {
        socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
        socket.destroy();
      }
    })();
  });
}
