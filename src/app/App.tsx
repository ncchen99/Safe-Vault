import { useEffect, useState } from 'react';
import { useVaultStore } from '@/store/vaultStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from './useTheme';
import { CreateVault } from '@/features/auth/CreateVault';
import {
  Onboarding,
  hasSeenOnboarding,
  markOnboardingSeen,
} from '@/features/onboarding/Onboarding';
import { UnlockVault } from '@/features/auth/UnlockVault';
import { RecoveryKitModal } from '@/features/auth/RecoveryKitModal';
import { VaultPage } from '@/features/vault/VaultPage';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';
import { Snackbar } from '@/components/Snackbar';

export function App() {
  const status = useVaultStore((s) => s.status);
  const init = useVaultStore((s) => s.init);
  const authInit = useAuthStore((s) => s.init);
  useTheme(); // 套用主題

  useEffect(() => {
    void init();
    authInit(); // 訂閱登入狀態（未設定 Firebase 時為 no-op）
  }, [init, authInit]);

  return (
    <>
      {status === 'loading' && (
        <div className="flex min-h-dvh items-center justify-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      )}
      {status === 'no-vault' && <NoVaultFlow />}
      {status === 'locked' && <UnlockVault />}
      {status === 'unlocked' && <VaultPage />}

      {/* 建立金庫後一次性顯示復原碼 */}
      <RecoveryKitModal />

      {/* PWA 安裝橫幅（可安裝時才出現） */}
      <InstallPrompt />

      {/* 全域底部提示（已複製密碼 / 帳號…） */}
      <Snackbar />
    </>
  );
}

/** 首次使用先看導覽，再進入建立金庫。 */
function NoVaultFlow() {
  const [seen, setSeen] = useState(hasSeenOnboarding);
  if (!seen) {
    return (
      <Onboarding
        onDone={() => {
          markOnboardingSeen();
          setSeen(true);
        }}
      />
    );
  }
  return <CreateVault />;
}
