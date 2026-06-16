import { useEffect, useRef, useState } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/solid';
import { FingerPrintIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useVaultStore } from '@/store/vaultStore';
import { ForgotPassword } from './ForgotPassword';
import { RestoreWithCode } from './RestoreWithCode';

export function UnlockVault() {
  const unlock = useVaultStore((s) => s.unlock);
  const unlockWithPasskey = useVaultStore((s) => s.unlockWithPasskey);
  const passkeySupported = useVaultStore((s) => s.passkeySupported);
  const hasPasskey = useVaultStore((s) => s.hasPasskey);
  const hasMasterPassword = useVaultStore((s) => s.hasMasterPassword);
  const error = useVaultStore((s) => s.error);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const canBio = passkeySupported && hasPasskey;

  async function onBio() {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      await unlockWithPasskey();
    } finally {
      setBioBusy(false);
    }
  }

  // 進入畫面時直接喚起 Passkey，不必先點按鈕（每次掛載僅自動嘗試一次；
  // 失敗或取消後不重試，使用者仍可手動點「用 Passkey 解鎖」）。
  const autoTried = useRef(false);
  useEffect(() => {
    if (!canBio || autoTried.current) return;
    autoTried.current = true;
    void (async () => {
      await onBio();
      // 自動喚起若被瀏覽器擋下或使用者取消，不要一進畫面就跳紅字錯誤。
      if (useVaultStore.getState().status !== 'unlocked') {
        useVaultStore.setState({ error: null });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBio]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true);
    try {
      await unlock(pw);
    } finally {
      setBusy(false);
      setPw('');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <LockClosedIcon className="mx-auto mb-3 h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">解鎖金庫</h1>
        <p className="mt-2 text-sm text-base-content/70">
          {canBio
            ? '用 Passkey 解鎖本機金庫'
            : hasMasterPassword
              ? '輸入主密碼以解密本機金庫'
              : '用復原碼在這台裝置還原金庫'}
        </p>
      </div>

      {canBio && (
        <div className="mb-4">
          <button
            type="button"
            className="btn btn-primary w-full touch-target"
            onClick={onBio}
            disabled={bioBusy}
          >
            {bioBusy ? (
              <span className="loading loading-spinner" />
            ) : (
              <>
                <FingerPrintIcon className="h-5 w-5" />
                用 Passkey 解鎖
              </>
            )}
          </button>
          {hasMasterPassword && (
            <div className="divider text-xs text-base-content/50">或用主密碼</div>
          )}
        </div>
      )}

      {hasMasterPassword && (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="form-control">
            <span className="label-text mb-1">主密碼</span>
            <input
              type="password"
              autoComplete="current-password"
              className="input input-bordered touch-target"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus={!canBio}
              aria-invalid={!!error}
            />
          </label>

          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full touch-target"
            disabled={busy || !pw}
          >
            {busy ? <span className="loading loading-spinner" /> : '解鎖'}
          </button>
        </form>
      )}

      {/* 沒有主密碼（免密碼金庫）且此裝置尚無指紋 → 復原碼是主要路徑 */}
      {!hasMasterPassword && !canBio && error && (
        <p className="mb-3 text-center text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={`btn w-full touch-target ${
          !hasMasterPassword && !canBio ? 'btn-primary' : 'btn-outline mt-4'
        }`}
        onClick={() => setRestoreOpen(true)}
      >
        <KeyIcon className="h-5 w-5" />
        用復原碼解鎖
      </button>

      {hasMasterPassword && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-2 w-full"
          onClick={() => setForgotOpen(true)}
        >
          忘記主密碼？
        </button>
      )}

      <ForgotPassword open={forgotOpen} onClose={() => setForgotOpen(false)} />
      <RestoreWithCode
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
      />
    </div>
  );
}
