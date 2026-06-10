/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MCP_BASE_URL?: string;
  readonly VITE_SYSTEM_USER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
