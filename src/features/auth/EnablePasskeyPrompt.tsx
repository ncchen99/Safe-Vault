/**
 * 換裝置登入 / 用復原碼還原後的強制步驟：在這台裝置設定 Passkey 解鎖。
 * 設定後，往後開啟即可用 Passkey（指紋、Face ID 或裝置密碼皆可）解鎖，
 * 不必再輸入復原碼。純本機操作（PRF 包裝 VK），秘密不離開裝置。
 *
 * 流程為「強制但可在不支援時略過」：預設沒有略過鈕；只有當此裝置的 Passkey
 * 確實無法用於解鎖（PRF 不支援）時，才顯示「暫時略過、改用復原碼」的退路，
 * 避免使用者被鎖在設定步驟外。
 */
import { useState } from 'react';
import { FingerPrintIcon } from '@heroicons/react/24/outline';
import { useVaultStore } from '@/store/vaultStore';

export function EnablePasskeyPrompt() {
  const suggest = useVaultStore((s) => s.suggestPasskey);
  const status = useVaultStore((s) => s.status);
  const passkeySupported = useVaultStore((s) => s.passkeySupported);
  const hasPasskey = useVaultStore((s) => s.hasPasskey);
  const enablePasskey = useVaultStore((s) => s.enablePasskey);
  const dismiss = useVaultStore((s) => s.dismissPasskeySuggestion);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 只有確認此裝置無法用 Passkey 解鎖（PRF 不支援）時才放行略過。
  const [canSkip, setCanSkip] = useState(false);

  const show =
    suggest && status === 'unlocked' && passkeySupported && !hasPasskey;
  if (!show) return null;

  async function onEnable() {
    setBusy(true);
    setErr(null);
    try {
      await enablePasskey(); // 觸發系統 Passkey 驗證（指紋／Face ID／裝置密碼）
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'PASSKEY_UNSUPPORTED') setCanSkip(true);
      setErr(e instanceof Error ? e.message : 'Passkey 設定失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-base-100/95 px-5 backdrop-blur">
      <div className="w-full max-w-sm text-center">
        <FingerPrintIcon className="mx-auto mb-3 h-12 w-12 text-primary" />
        <h2 className="text-xl font-bold">在這台裝置設定 Passkey</h2>
        <p className="mt-2 text-sm text-base-content/70">
          設定後，下次開啟用 Passkey 即可解鎖，免再輸入復原碼。
          指紋、Face ID 或裝置密碼皆可使用；Passkey 秘密只留在本機、永不上傳。
        </p>

        {err && (
          <p className="mt-4 text-sm text-error" role="alert">
            {err}
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button
            className="btn btn-primary w-full touch-target"
            onClick={() => void onEnable()}
            disabled={busy}
          >
            {busy ? (
              <span className="loading loading-spinner" />
            ) : (
              <>
                <FingerPrintIcon className="h-5 w-5" />
                {canSkip ? '再試一次' : '設定 Passkey'}
              </>
            )}
          </button>

          {canSkip && (
            <button
              className="btn btn-ghost w-full text-base-content/60 touch-target"
              onClick={dismiss}
              disabled={busy}
            >
              暫時略過，改用復原碼解鎖
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
