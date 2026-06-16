/**
 * 響應式容器：
 *  - 手機：開啟為「整頁」新頁面（fixed 全螢幕），左上角叉叉關閉。
 *    手機輸入不便，內容多時整頁比 modal 更好操作（需求：不使用 modal）。
 *  - 桌面：置中浮層（modal），同樣將關閉叉叉置於左上角。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useIsMobile } from '@/app/useMediaQuery';
import { useBackButton } from '@/app/useBackButton';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Header 右上角動作（如儲存）。避免底部按鈕被虛擬鍵盤遮擋。 */
  headerAction?: ReactNode;
}

export function ResponsiveSheet({
  open,
  title,
  onClose,
  children,
  headerAction,
}: Props) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // 手機返回鍵攔截：sheet 開啟時 push history state，按返回會關閉 sheet
  useBackButton(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const header = (
    <div className="flex items-center gap-2 border-b border-base-300 px-2 py-2">
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square touch-target"
        onClick={onClose}
        aria-label="關閉"
      >
        <XMarkIcon className="h-6 w-6" />
      </button>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {headerAction && <div className="ml-auto">{headerAction}</div>}
    </div>
  );

  if (isMobile) {
    // 整頁：左上叉叉 + 可捲動內容
    return (
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || '對話框'}
        className="fixed inset-0 z-50 flex flex-col bg-base-100 outline-none"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="sticky top-0 z-10 bg-base-100">{header}</div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    );
  }

  // 桌面：置中浮層
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title || '對話框'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-md flex-col bg-base-100 shadow-xl outline-none"
      >
        {header}
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
