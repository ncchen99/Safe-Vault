/**
 * 底部 Snackbar：短暫顯示操作回饋（已複製密碼 / 已複製帳號…）。
 * 固定在畫面底部、置中，約 3 秒後淡出。純展示，不含任何敏感資料。
 */
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';
import { useToastStore } from '@/store/toastStore';

const ICON = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  info: InformationCircleIcon,
};

export function Snackbar() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!message) return null;

  const Icon = ICON[kind];
  const tint =
    kind === 'error'
      ? 'text-error'
      : kind === 'info'
        ? 'text-info'
        : 'text-success';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={dismiss}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-neutral px-4 py-3 text-sm font-medium text-neutral-content shadow-lg animate-[snackbar-in_180ms_ease-out]"
      >
        <Icon className={`h-5 w-5 ${tint}`} />
        {message}
      </button>
    </div>
  );
}
