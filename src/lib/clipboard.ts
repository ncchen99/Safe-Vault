/**
 * 複製到剪貼簿：統一提示文案與安全清除。
 * 安全：30 秒後嘗試清空剪貼簿，降低機密值滯留的風險。
 */
import { toast } from '@/store/toastStore';

export async function copyToClipboard(value: string, label: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    toast('複製失敗，請手動選取複製', 'error');
    return;
  }
  toast(`已複製${label}`);
  setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
}
