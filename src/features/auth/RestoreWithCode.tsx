/**
 * 用復原碼解鎖 / 還原金庫。
 * 換新裝置（免密碼金庫、此裝置尚無 Passkey）時的主要解鎖方式：
 * 輸入復原碼即解出 VK 解鎖，不重設主密碼。解鎖後會要求在此裝置設定 Passkey。
 */
import { useState } from 'react';
import { KeyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ResponsiveSheet } from '@/components/ResponsiveSheet';
import { useVaultStore } from '@/store/vaultStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RestoreWithCode({ open, onClose }: Props) {
  const restoreWithCode = useVaultStore((s) => s.restoreWithCode);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = Boolean(code.trim()) && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await restoreWithCode(code);
      setCode('');
      onClose(); // 成功後金庫解鎖；EnablePasskeyPrompt 會接著要求設定 Passkey
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '復原失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      title="用復原碼解鎖"
      onClose={() => {
        setCode('');
        setErr(null);
        onClose();
      }}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-start gap-2 bg-base-200 p-3 text-sm">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <span>
            輸入你建立金庫時保存的<strong>復原碼</strong>
            即可在這台裝置解鎖。解鎖後可立即設定 Passkey，下次免再輸入。
          </span>
        </div>

        <label className="form-control">
          <span className="label-text mb-1">復原碼</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            className="input input-bordered touch-target font-mono tracking-wider"
            placeholder="ABCD-EFGH-…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </label>

        {err && (
          <p className="text-sm text-error" role="alert">
            {err}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full touch-target"
          disabled={!canSubmit}
        >
          {busy ? (
            <span className="loading loading-spinner" />
          ) : (
            <>
              <KeyIcon className="h-5 w-5" />
              解鎖金庫
            </>
          )}
        </button>
      </form>
    </ResponsiveSheet>
  );
}
