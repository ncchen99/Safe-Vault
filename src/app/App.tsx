import { useEffect } from 'react';
import { useVaultStore } from '@/store/vaultStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from './useTheme';
import { useAppHeight } from './useAppHeight';
import { SetupFlow } from '@/features/onboarding/SetupFlow';
import { UnlockVault } from '@/features/auth/UnlockVault';
import { RecoveryKitModal } from '@/features/auth/RecoveryKitModal';
import { EnablePasskeyPrompt } from '@/features/auth/EnablePasskeyPrompt';
import { VaultPage } from '@/features/vault/VaultPage';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt';
import { Snackbar } from '@/components/Snackbar';

export function App() {
  const status = useVaultStore((s) => s.status);
  const init = useVaultStore((s) => s.init);
  const authInit = useAuthStore((s) => s.init);
  useTheme(); // 套用主題
  useAppHeight(); // 量測實際可視高度寫入 --app-height

  useEffect(() => {
    void init();
    authInit(); // 訂閱登入狀態（未設定 Firebase 時為 no-op）
  }, [init, authInit]);

  return (
    <>
      {status === 'loading' && (
        <div className="flex min-h-[var(--app-height)] items-center justify-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      )}
      {status === 'no-vault' && <SetupFlow />}
      {status === 'locked' && <UnlockVault />}
      {status === 'unlocked' && <VaultPage />}

      {/* 建立金庫後一次性顯示復原碼 */}
      <RecoveryKitModal />

      {/* 換裝置 / 復原後強制在此裝置設定 Passkey（不支援時可略過） */}
      <EnablePasskeyPrompt />

      {/* PWA 安裝橫幅（可安裝時才出現） */}
      <InstallPrompt />

      {/* PWA 更新提示（偵測到新版 Service Worker 時才出現） */}
      <UpdatePrompt />

      {/* 全域底部提示（已複製密碼 / 帳號…） */}
      <Snackbar />
    </>
  );
}
