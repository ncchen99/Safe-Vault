import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ServiceEntry } from '@/types/entry';
import { ServiceIcon } from '@/components/ServiceIcon';
import { toast } from '@/store/toastStore';

interface Props {
  entry: ServiceEntry;
  onOpen: (entry: ServiceEntry) => void;
}

export function EntryRow({ entry, onOpen }: Props) {
  const primary = entry.credentials[0];
  const usernamePreview = primary?.username;
  const hasPassword = Boolean(primary?.password);
  const hasUsername = Boolean(primary?.username);
  // 有密碼 → 複製密碼；否則退而複製帳號（需求 2a/2b）
  const canCopy = hasPassword || hasUsername;

  async function copyPrimary() {
    const value = primary?.password ?? primary?.username;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast('複製失敗，請手動長按複製', 'error');
      return;
    }
    toast(hasPassword ? '已複製密碼' : '已複製帳號');
    // 安全：30 秒後嘗試清空剪貼簿
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
  }

  return (
    <li className="flex items-center transition-colors hover:bg-base-200">
      {/* 點整列 → 複製密碼（無密碼則複製帳號） */}
      <button
        type="button"
        onClick={copyPrimary}
        disabled={!canCopy}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left touch-target disabled:cursor-default"
        aria-label={
          canCopy
            ? `複製「${entry.service}」的${hasPassword ? '密碼' : '帳號'}`
            : entry.service
        }
      >
        <ServiceIcon entry={entry} />

        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{entry.service}</div>
          <div className="truncate text-sm text-base-content/60">
            {usernamePreview || '（無帳號）'}
          </div>
          <div className="truncate text-sm text-base-content/40">
            {hasPassword ? (
              <span className="tracking-widest">••••••••</span>
            ) : (
              '（無密碼）'
            )}
          </div>
        </div>
      </button>

      {/* 點箭頭 → 檢視 / 編輯 */}
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="btn btn-ghost btn-square h-full px-3 touch-target"
        aria-label={`檢視 / 編輯「${entry.service}」`}
      >
        <ChevronRightIcon className="h-5 w-5 flex-none text-base-content/30" />
      </button>
    </li>
  );
}
