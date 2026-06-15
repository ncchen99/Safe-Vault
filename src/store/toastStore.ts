/**
 * 全域 Snackbar（Android 風格的底部提示）狀態。
 * 僅用於短暫的操作回饋（如「已複製密碼」），約 3 秒後自動消失。
 */
import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  kind: ToastKind;
  /** 內部：用於辨識當前計時器，避免舊計時器把新訊息清掉。 */
  token: number;
  show: (message: string, kind?: ToastKind) => void;
  dismiss: () => void;
}

const DURATION_MS = 3000;

export const useToastStore = create<ToastState>((set, get) => ({
  message: null,
  kind: 'success',
  token: 0,
  show: (message, kind = 'success') => {
    const token = get().token + 1;
    set({ message, kind, token });
    setTimeout(() => {
      // 只有在沒有更新的訊息時才清除（避免覆蓋後續提示）
      if (get().token === token) set({ message: null });
    }, DURATION_MS);
  },
  dismiss: () => set({ message: null, token: get().token + 1 }),
}));

/** 便捷函式：在非元件處（store/handler）觸發提示。 */
export function toast(message: string, kind?: ToastKind): void {
  useToastStore.getState().show(message, kind);
}
