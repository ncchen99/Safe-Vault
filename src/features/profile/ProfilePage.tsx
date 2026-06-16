/**
 * 個人設定頁：集中管理帳號 / 備份（雲端同步）、安全（Passkey、主密碼）與工作階段。
 * 取代舊版散落在頂部工具列的鎖頭 / Passkey / 雲端圖示。
 */
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  CloudIcon,
  FingerPrintIcon,
  KeyIcon,
  LockClosedIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useVaultStore } from '@/store/vaultStore';
import { useAuthStore } from '@/store/authStore';
import { ForgotPassword } from '@/features/auth/ForgotPassword';
import { toast } from '@/store/toastStore';

interface Props {
  onBack: () => void;
}

export function ProfilePage({ onBack }: Props) {
  const lock = useVaultStore((s) => s.lock);
  const passkeySupported = useVaultStore((s) => s.passkeySupported);
  const hasPasskey = useVaultStore((s) => s.hasPasskey);
  const hasMasterPassword = useVaultStore((s) => s.hasMasterPassword);
  const enablePasskey = useVaultStore((s) => s.enablePasskey);
  const disablePasskey = useVaultStore((s) => s.disablePasskey);
  const entries = useVaultStore((s) => s.entries);
  const removeEntry = useVaultStore((s) => s.removeEntry);

  const enabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const syncState = useAuthStore((s) => s.syncState);
  const lastSummary = useAuthStore((s) => s.lastSummary);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const sync = useAuthStore((s) => s.sync);

  const [bioBusy, setBioBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  const syncing = syncState === 'syncing';
  const signingIn = syncState === 'signing-in';

  async function toggleBio() {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      if (hasPasskey) {
        if (confirm('要停用 Passkey 解鎖嗎？之後改用主密碼解鎖。')) await disablePasskey();
      } else {
        try {
          await enablePasskey(); // 觸發系統 Passkey 驗證（指紋／Face ID／裝置密碼）
        } catch (e) {
          // 日常解鎖的 VK 不可匯出，無法直接包裝 → 需再次驗證主密碼後重試。
          if (e instanceof Error && (e as { code?: string }).code === 'REAUTH_REQUIRED') {
            const pw = prompt('為保護金鑰，請再次輸入主密碼以設定 Passkey 解鎖');
            if (!pw) return;
            await enablePasskey(pw);
          } else {
            throw e;
          }
        }
        toast('已啟用 Passkey 解鎖');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Passkey 設定失敗', 'error');
    } finally {
      setBioBusy(false);
    }
  }

  const displayName = user?.displayName || user?.email || '本機使用者';

  async function wipeAllEntries() {
    if (wiping || entries.length === 0) return;
    const ok = confirm(
      `確定要刪除全部 ${entries.length} 筆條目嗎？此操作無法復原；其他已同步裝置的資料也會一併刪除。`,
    );
    if (!ok) return;
    setWiping(true);
    try {
      for (const e of entries) await removeEntry(e.id);
      if (enabled && user) await sync(); // 立即推送墓碑，讓其他裝置同步刪除
      toast('已刪除全部條目');
    } catch (e) {
      toast(e instanceof Error ? e.message : '刪除失敗', 'error');
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* 頁首：返回 + 標題 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-base-300 bg-base-100/95 px-2 py-2 backdrop-blur">
        <button
          className="btn btn-ghost btn-sm btn-square touch-target"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-base font-semibold">個人設定</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6 md:mx-0 md:px-6">
        {/* 帳號 */}
        <section className="flex items-center gap-4">
          <UserCircleIcon className="h-14 w-14 text-base-content/40" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{displayName}</div>
            <div className="text-sm text-base-content/60">
              {user ? '雲端備份已連結' : '純本地模式'}
            </div>
          </div>
        </section>

        {/* 備份設定 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-base-content/60">
            備份設定
          </h2>
          <div className="border border-base-300 bg-base-100">
            {!enabled ? (
              <p className="px-4 py-4 text-sm text-base-content/60">
                此裝置尚未設定雲端同步，資料僅保存在本機。
              </p>
            ) : !user ? (
              <button
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-base-200 touch-target"
                onClick={() => void signIn()}
                disabled={signingIn}
              >
                {signingIn ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <CloudIcon className="h-5 w-5 flex-none" />
                )}
                <span>
                  <span className="block font-medium">登入 Google 啟用備份</span>
                  <span className="block text-sm text-base-content/60">
                    雲端只存密文，無法解讀你的密碼（零知識）
                  </span>
                </span>
              </button>
            ) : (
              <>
                <button
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-base-200 touch-target"
                  onClick={() => void sync()}
                  disabled={syncing}
                >
                  <ArrowPathIcon
                    className={`h-5 w-5 flex-none ${syncing ? 'animate-spin' : ''}`}
                  />
                  <span>
                    <span className="block font-medium">
                      {syncing ? '同步中…' : '立即同步'}
                    </span>
                    <span className="block text-sm text-base-content/60">
                      {error
                        ? `⚠︎ ${error}`
                        : lastSummary
                          ? `上次同步 ${lastSummary}`
                          : '尚未同步'}
                    </span>
                  </span>
                </button>
                <div className="border-t border-base-300" />
                <button
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-base-200 touch-target"
                  onClick={() => void signOut()}
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 flex-none" />
                  <span className="font-medium">登出（{user.email}）</span>
                </button>
              </>
            )}
          </div>
        </section>

        {/* 安全 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-base-content/60">安全</h2>
          <div className="border border-base-300 bg-base-100">
            {passkeySupported && (
              <>
                <div className="flex items-center gap-3 px-4 py-4">
                  <FingerPrintIcon className="h-5 w-5 flex-none" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Passkey 解鎖</div>
                    <div className="text-sm text-base-content/60">
                      {hasPasskey
                        ? '已在此裝置啟用'
                        : '指紋、Face ID 或裝置密碼皆可'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={hasPasskey}
                    disabled={bioBusy}
                    onChange={toggleBio}
                    aria-label="Passkey 解鎖"
                  />
                </div>
                <div className="border-t border-base-300" />
              </>
            )}
            <button
              className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-base-200 touch-target"
              onClick={() => setPwOpen(true)}
            >
              <KeyIcon className="h-5 w-5 flex-none" />
              <span>
                <span className="block font-medium">
                  {hasMasterPassword ? '變更主密碼' : '設定主密碼'}
                </span>
                <span className="block text-sm text-base-content/60">
                  {hasMasterPassword
                    ? '使用復原碼重設主密碼'
                    : '為免密碼金庫加上主密碼解鎖'}
                </span>
              </span>
            </button>
          </div>
        </section>

        {/* 工作階段 */}
        <section>
          <button
            className="flex w-full items-center gap-3 border border-base-300 bg-base-100 px-4 py-4 text-left hover:bg-base-200 touch-target"
            onClick={lock}
          >
            <LockClosedIcon className="h-5 w-5 flex-none" />
            <span className="font-medium">鎖定金庫</span>
          </button>
        </section>

        {/* 危險操作 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-error/80">危險操作</h2>
          <button
            className="flex w-full items-center gap-3 border border-error/30 bg-base-100 px-4 py-4 text-left hover:bg-error/10 touch-target disabled:opacity-50"
            onClick={() => void wipeAllEntries()}
            disabled={wiping || entries.length === 0}
          >
            {wiping ? (
              <span className="loading loading-spinner loading-sm text-error" />
            ) : (
              <TrashIcon className="h-5 w-5 flex-none text-error" />
            )}
            <span>
              <span className="block font-medium text-error">
                刪除所有條目（{entries.length} 筆）
              </span>
              <span className="block text-sm text-base-content/60">
                清空後可重新匯入；已啟用同步者，其他裝置也會一併清除
              </span>
            </span>
          </button>
        </section>
      </div>

      {pwOpen && (
        <ForgotPassword
          open
          onClose={() => setPwOpen(false)}
          title={hasMasterPassword ? '變更主密碼' : '設定主密碼'}
          cta={hasMasterPassword ? '變更主密碼' : '設定主密碼'}
        />
      )}
    </div>
  );
}
