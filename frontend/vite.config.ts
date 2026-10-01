import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const WETTY_TARGET = "https://terminal.cloudeasy.site";

function stripEmbedBlockHeaders(_proxyRes: IncomingMessage, _req: IncomingMessage, res: ServerResponse) {
  res.removeHeader("x-frame-options");
  res.removeHeader("content-security-policy");
  res.removeHeader("cross-origin-opener-policy");
  res.removeHeader("cross-origin-resource-policy");
}

const wettyProxy = {
  target: WETTY_TARGET,
  changeOrigin: true,
  secure: true,
  ws: true,
  configure: (proxy: { on: (event: string, fn: typeof stripEmbedBlockHeaders) => void }) => {
    proxy.on("proxyRes", stripEmbedBlockHeaders);
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/wetty": {
        ...wettyProxy,
        rewrite: (path) => path.replace(/^\/wetty/, "") || "/",
      },
      "/client": wettyProxy,
      "/socket.io": wettyProxy,
    },
  },
});
