/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LAUNCH_AES_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_URLS?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_SESSION_LOOKUP_PATH?: string;
  readonly VITE_SESSION_LOOKUP_PATHS?: string;
  readonly VITE_KPI_ROLE_ID_MAP?: string;
  readonly VITE_BACKEND_API_URL?: string;
  readonly BACKEND_API_URL?: string;
  readonly VITE_DEV_FALLBACK_USER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
