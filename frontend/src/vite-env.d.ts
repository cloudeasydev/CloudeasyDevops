/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_URL: string;
  readonly VITE_TERMINAL_URL?: string;
  readonly VITE_TERMINAL_USE_PROXY?: string;
  /** Force new-tab terminal (default on localhost). */
  readonly VITE_TERMINAL_POPOUT?: string;
  /** Try iframe even on localhost (usually blocked by WeTTY). */
  readonly VITE_TERMINAL_EMBED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
