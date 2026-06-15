/**
 * 帳號 / 同步狀態（Zustand）。與金庫解鎖分離：
 * 登入只用來定位雲端密文；解密金鑰（VK）永遠只在 vaultStore 的記憶體中。
 * 未設定 Firebase 時 enabled=false，UI 不顯示同步功能（純本地模式）。
 *
 * 自動同步：
 *  - 本機寫入（syncBus）→ 去抖動推送。
 *  - 其他裝置推送（Firestore onSnapshot 即時訂閱）→ 去抖動拉取。
 *  - 重新上線（online 事件）/ 回到前景（visibilitychange）→ 補一次同步。
 */
import { create } from 'zustand';
import { isFirebaseConfigured } from '@/firebase/config';
import type { AuthUser } from '@/firebase/auth';
import { syncBus } from '@/sync/bus';
import { useVaultStore } from './vaultStore';

export type SyncState = 'idle' | 'signing-in' | 'syncing' | 'ok' | 'error';

interface AuthState {
  enabled: boolean;
  user: AuthUser | null;
  syncState: SyncState;
  lastSyncAt: number | null;
  lastSummary: string | null;
  error: string | null;
  /** 目前是否連線（離線時自動同步暫停，回線後補同步）。 */
  online: boolean;

  init: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  sync: () => Promise<void>;
  /** 去抖動觸發同步（合併短時間內的多次變更）。 */
  scheduleSync: () => void;
}

const SYNC_DEBOUNCE_MS = 800;

// 模組層級的可變狀態（不需觸發 re-render）。
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubRealtime: (() => void) | null = null;
let wired = false; // 全域監聽只裝一次

export const useAuthStore = create<AuthState>((set, get) => ({
  enabled: isFirebaseConfigured,
  user: null,
  syncState: 'idle',
  lastSyncAt: null,
  lastSummary: null,
  error: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,

  init: () => {
    if (!isFirebaseConfigured) return;
    wireGlobalListeners(get);

    // 動態載入，避免未設定 Firebase 時把 SDK 拉進關鍵路徑
    void import('@/firebase/auth').then(({ subscribeAuth }) => {
      subscribeAuth((user) => {
        set({ user });
        if (user && useVaultStore.getState().status === 'unlocked') {
          void get().sync();
          void startRealtime(get);
        } else if (!user) {
          stopRealtime();
        }
      });
    });
  },

  signIn: async () => {
    set({ syncState: 'signing-in', error: null });
    try {
      const { signInWithGoogle } = await import('@/firebase/auth');
      const user = await signInWithGoogle();
      set({ user, syncState: 'idle' });
      if (useVaultStore.getState().status === 'unlocked') {
        await get().sync();
        void startRealtime(get);
      }
    } catch (e) {
      set({ syncState: 'error', error: errMsg(e) });
    }
  },

  signOut: async () => {
    stopRealtime();
    const { signOutUser } = await import('@/firebase/auth');
    await signOutUser();
    set({ user: null, syncState: 'idle', lastSummary: null });
  },

  sync: async () => {
    const { user, online } = get();
    if (!user || !online) return;
    if (useVaultStore.getState().status !== 'unlocked') return;
    set({ syncState: 'syncing', error: null });
    try {
      const o = await useVaultStore.getState().syncWithRemote(user.uid);
      set({
        syncState: 'ok',
        lastSyncAt: Date.now(),
        lastSummary: `↑${o.pushed} ↓${o.pulled}${
          o.conflicts ? ` ⚠︎${o.conflicts} 衝突` : ''
        }`,
      });
      // 已登入但尚未訂閱即時更新（例如登入時金庫還沒解鎖）→ 補上
      void startRealtime(get);
    } catch (e) {
      set({ syncState: 'error', error: errMsg(e) });
    }
  },

  scheduleSync: () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void get().sync();
    }, SYNC_DEBOUNCE_MS);
  },
}));

/** 安裝全域監聽：本機變更、上線、回前景。只裝一次。 */
function wireGlobalListeners(get: () => AuthState): void {
  if (wired) return;
  wired = true;

  // 本機資料變更 → 去抖動推送
  syncBus.onLocalChange(() => get().scheduleSync());

  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    useAuthStore.setState({ online: true });
    get().scheduleSync();
  });
  window.addEventListener('offline', () => {
    useAuthStore.setState({ online: false });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') get().scheduleSync();
  });
}

/** 開始即時訂閱遠端變更（其他裝置推送時自動拉取）。 */
async function startRealtime(get: () => AuthState): Promise<void> {
  const { user } = get();
  if (!user || unsubRealtime) return;
  const { subscribeRemote } = await import('@/sync/remote');
  unsubRealtime = subscribeRemote(user.uid, ({ fromSelf }) => {
    // 略過本裝置自己造成的回音；只對來自他處的變更觸發同步
    if (fromSelf) return;
    get().scheduleSync();
  });
}

function stopRealtime(): void {
  if (unsubRealtime) {
    unsubRealtime();
    unsubRealtime = null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : '同步失敗';
}
