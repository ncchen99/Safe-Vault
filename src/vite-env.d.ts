/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_FB_API_KEY: string;
  readonly VITE_FB_AUTH_DOMAIN: string;
  readonly VITE_FB_PROJECT_ID: string;
  readonly VITE_FB_STORAGE_BUCKET: string;
  readonly VITE_FB_APP_ID: string;
  readonly VITE_USE_EMULATORS: string;
  /** App Check（reCAPTCHA Enterprise）網站金鑰；公開值。 */
  readonly VITE_FB_APPCHECK_SITE_KEY?: string;
  /** 僅本機開發：已登錄的 App Check debug token（勿提交）。 */
  readonly VITE_FB_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
