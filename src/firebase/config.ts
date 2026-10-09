/**
 * Firebase web config（皆為公開值，非機密）與 Emulator 開關。
 * 缺少設定時 isFirebaseConfigured 為 false，App 會以「純本地模式」運作，
 * 不顯示同步功能，確保未設定後端時仍能完整使用。
 */
import type { FirebaseOptions } from 'firebase/app';

export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FB_APP_ID,
};

/**
 * App Check（reCAPTCHA Enterprise）網站金鑰，公開值。
 * 設定後 Firestore 請求會附上 App Check 權杖，只有本站發出的請求能通過（防 API 濫用）。
 */
export const appCheckSiteKey: string | undefined = import.meta.env.VITE_FB_APPCHECK_SITE_KEY;

/** 是否連 Firebase Emulator Suite（本機開發） */
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

/** 是否已提供可用的 Firebase 設定（projectId 為必要值） */
export const isFirebaseConfigured = Boolean(firebaseConfig.projectId);
