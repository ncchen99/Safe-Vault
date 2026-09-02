/**
 * 疊在輸入框「框內右側」的行內動作鈕（顯示／隱藏、複製…）。
 *
 * 集中處理兩件容易做錯的事：
 *  1. 右側留白——動作區與輸入框右邊框保持距離，不會緊貼邊緣。
 *  2. 輸入框的右內距——文字不可跑到按鈕底下，故呼叫端必須套用
 *     inputActionPad 給出的 pr-*（依尺寸與按鈕數量）。
 *
 * 排列順序即視覺順序（由左至右）；密碼欄慣例為「顯示」在左、「複製」在右。
 */
import type { ReactNode } from 'react';

/** 依動作鈕數量所需的輸入框右內距（與下方尺寸常數對應）。 */
export const inputActionPad = {
  /** 一般輸入框（btn-sm 32px 鈕，右留白 8px）。 */
  md: ['', 'pr-11', 'pr-20'],
  /** 密集列的 input-sm（btn-xs 24px 鈕，右留白 4px）。 */
  sm: ['', 'pr-9', 'pr-[3.75rem]'],
} as const;

export function InputActions({
  compact = false,
  children,
}: {
  /** 密集列（input-sm）用較小的鈕與留白。 */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 flex items-center ${
        compact ? 'right-1 gap-0.5' : 'right-2 gap-1'
      }`}
    >
      {children}
    </div>
  );
}

export function InputActionButton({
  label,
  onClick,
  compact = false,
  children,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn btn-circle btn-ghost pointer-events-auto text-base-content/60 hover:text-base-content ${
        compact ? 'btn-xs' : 'btn-sm'
      }`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
