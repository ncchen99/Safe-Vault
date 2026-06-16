/**
 * 首次設定流程（取代舊的 Onboarding → CreateVault）。
 *
 * 預設路徑（零知識、免主密碼）：
 *   導覽 → Google 登入並啟用雲端同步 →
 *     · 雲端已有金庫（換裝置）→ 採用之 → 轉解鎖頁，用復原碼/Passkey 還原
 *     · 全新使用者 → 用 Passkey 建立金庫，完全不需主密碼
 *   不支援 Passkey 或使用者選擇時，才退回「主密碼」建立。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FingerPrintIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import { useVaultStore } from '@/store/vaultStore';
import { CreateVault } from '@/features/auth/CreateVault';
import {
  Onboarding,
  hasSeenOnboarding,
  markOnboardingSeen,
} from './Onboarding';

type Phase = 'intro' | 'choose' | 'new' | 'master';

export function SetupFlow() {
  const [phase, setPhase] = useState<Phase>(
    hasSeenOnboarding() ? 'choose' : 'intro',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.syncState === 'signing-in');

  const passkeySupported = useVaultStore((s) => s.passkeySupported);
  const createWithPasskey = useVaultStore((s) => s.createWithPasskey);
  const tryAdoptRemoteVault = useVaultStore((s) => s.tryAdoptRemoteVault);

  const adopting = useRef(false);

  // 已登入後：採用雲端既有金庫，或標記為全新使用者。狀態轉變後本元件會被卸載。
  const proceedAfterSignIn = useCallback(
    async (uid: string) => {
      if (adopting.current) return;
      adopting.current = true;
      setBusy(true);
      setErr(null);
      try {
        const adopted = await tryAdoptRemoteVault(uid);
        if (!adopted) setPhase('new'); // 雲端沒有金庫 → 全新使用者，往下建立
      } catch (e) {
        setErr(e instanceof Error ? e.message : '讀取雲端金庫失敗');
      } finally {
        setBusy(false);
        adopting.current = false;
      }
    },
    [tryAdoptRemoteVault],
  );

  // 若進入 choose 時已登入（例如先前登入過），直接續流程。
  useEffect(() => {
    if (phase === 'choose' && enabled && user) void proceedAfterSignIn(user.uid);
  }, [phase, enabled, user, proceedAfterSignIn]);

  // 純本地模式（未設定 Firebase）：略過登入，直接建立。
  useEffect(() => {
    if (phase === 'choose' && !enabled) setPhase('new');
  }, [phase, enabled]);

  if (phase === 'intro') {
    return (
      <Onboarding
        onDone={() => {
          markOnboardingSeen();
          setPhase('choose');
        }}
      />
    );
  }

  // 主密碼建立（明確選擇，或裝置不支援 Passkey）→ 用 CreateVault 全屏表單。
  if (phase === 'master' || (phase === 'new' && !passkeySupported)) {
    return <CreateVault />;
  }

  async function onGoogle() {
    setErr(null);
    await signIn();
    const uid = useAuthStore.getState().user?.uid;
    if (uid) void proceedAfterSignIn(uid);
  }

  async function onPasskeyCreate() {
    setBusy(true);
    setErr(null);
    try {
      await createWithPasskey();
    } catch (e) {
      setErr(
        e instanceof Error
          ? `Passkey 建立未完成：${e.message}`
          : 'Passkey 建立未完成',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <ShieldCheckIcon className="mx-auto mb-3 h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">
          {phase === 'choose' ? '啟用同步' : '建立你的金庫'}
        </h1>
        <p className="mt-2 text-sm text-base-content/70">
          {phase === 'choose'
            ? '用 Google 登入以在多裝置同步。雲端只存密文，無法解讀你的密碼（零知識）。'
            : passkeySupported
              ? '用 Passkey 建立金庫，免設、免記主密碼（指紋、Face ID 或裝置密碼皆可）。'
              : '此裝置不支援 Passkey，請設定主密碼來保護金庫。'}
        </p>
      </div>

      {err && (
        <p className="mb-4 text-center text-sm text-error" role="alert">
          {err}
        </p>
      )}

      {/* 步驟一：Google 登入（已設定 Firebase 時） */}
      {phase === 'choose' && (
        <div className="space-y-3">
          <button
            className="btn btn-primary w-full touch-target"
            onClick={() => void onGoogle()}
            disabled={busy || signingIn}
          >
            {busy || signingIn ? (
              <span className="loading loading-spinner" />
            ) : (
              '使用 Google 登入'
            )}
          </button>
          <button
            className="btn btn-ghost btn-sm w-full text-base-content/60"
            onClick={() => setPhase('new')}
            disabled={busy || signingIn}
          >
            略過，僅在這台裝置使用
          </button>
        </div>
      )}

      {/* 步驟二：建立金庫（全新使用者） */}
      {phase === 'new' && passkeySupported && (
        <div className="space-y-3">
          <button
            className="btn btn-primary w-full touch-target"
            onClick={() => void onPasskeyCreate()}
            disabled={busy}
          >
            {busy ? (
              <span className="loading loading-spinner" />
            ) : (
              <>
                <FingerPrintIcon className="h-5 w-5" />
                用 Passkey 建立金庫
              </>
            )}
          </button>
          <p className="px-1 text-center text-xs text-base-content/50">
            建立後會顯示一組「復原碼」。換新裝置時用它還原，請務必保存。
          </p>
          <button
            className="btn btn-ghost btn-sm w-full text-base-content/60"
            onClick={() => setPhase('master')}
            disabled={busy}
          >
            <KeyIcon className="h-4 w-4" />
            改用主密碼
          </button>
        </div>
      )}
    </div>
  );
}
