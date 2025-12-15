/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;

  // Feature flags (string values: "true" / "false")
  readonly VITE_ENABLE_IMAGE_GENERATION?: string;
  readonly VITE_ENABLE_VIDEO_GENERATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
