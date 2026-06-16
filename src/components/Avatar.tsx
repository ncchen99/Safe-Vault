/**
 * 使用者頭像按鈕：點擊進入個人設定頁。
 * 已登入雲端同步時顯示帳號縮寫；否則顯示通用人像（純本地模式）。
 */
import { UserIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';

interface Props {
  onClick: () => void;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // 取 email 帳號或顯示名稱的第一個字（中英皆可）
  return trimmed[0]!.toUpperCase();
}

export function Avatar({ onClick }: Props) {
  const user = useAuthStore((s) => s.user);
  const label = user?.displayName || user?.email || '';
  const text = label ? initials(label) : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-ghost btn-square btn-sm touch-target"
      aria-label="個人設定"
      title="個人設定"
    >
      {text ? (
        <span className="flex h-8 w-8 items-center justify-center bg-primary font-semibold text-primary-content">
          {text}
        </span>
      ) : (
        <UserIcon className="h-7 w-7" />
      )}
    </button>
  );
}
