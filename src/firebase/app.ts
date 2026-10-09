/**
 * Firebase 初始化（lazy、單例）。
 * 只有在已設定 projectId 時才會建立實例；Auth 僅用於「定位使用者的密文」，
 * 與加解密金鑰完全分離（伺服器永遠拿不到 VK 或主密碼）。
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  appCheckSiteKey,
  firebaseConfig,
  isFirebaseConfigured,
  useEmulators,
} from './config';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 尚未設定（缺少 VITE_FB_PROJECT_ID）');
  }
  if (!app) {
    app = initializeApp(firebaseConfig);
    // App Check 必須在使用 Firestore/Auth 之前初始化。Emulator 不需要。
    if (appCheckSiteKey && !useEmulators) {
      if (import.meta.env.DEV) {
        // localhost 不在 reCAPTCHA 金鑰的網域內 → 本機開發改用 App Check debug token。
        // 優先使用 .env 中已在 Firebase Console 登錄的固定 token；否則由 SDK 產生並印在 console。
        (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
          import.meta.env.VITE_FB_APPCHECK_DEBUG_TOKEN || true;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return app;
}

export function getAuthInstance(): Auth {
  if (!authInstance) {
    authInstance = getAuth(ensureApp());
    // 各實例建立時各自連 Emulator（共用旗標會讓後建立者漏接、誤連正式環境）
    if (useEmulators) {
      connectAuthEmulator(authInstance, 'http://localhost:9099', {
        disableWarnings: true,
      });
    }
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(ensureApp());
    if (useEmulators) connectFirestoreEmulator(dbInstance, 'localhost', 8080);
  }
  return dbInstance;
}
