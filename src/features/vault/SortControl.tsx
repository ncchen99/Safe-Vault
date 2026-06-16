/**
 * 排序選擇器：
 *  - 桌面：點按鈕展開錨定其下方的小浮層（popover）。
 *  - 手機：自底部滑出大尺寸選單（bottom sheet），每列為易點擊的觸控目標，
 *    避免桌面 dropdown 在手機上難以點選的問題。
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowsUpDownIcon,
  CheckIcon,
  ClockIcon,
  LanguageIcon,
} from '@heroicons/react/24/outline';
import { useIsMobile } from '@/app/useMediaQuery';

export type SortKey = 'recent' | 'name';

const OPTIONS: {
  key: SortKey;
  label: string;
  hint: string;
  Icon: typeof ClockIcon;
}[] = [
  {
    key: 'recent',
    label: '最新修改',
    hint: '最近更新的排在前面',
    Icon: ClockIcon,
  },
  {
    key: 'name',
    label: '服務名稱',
    hint: '依名稱字母順序排列',
    Icon: LanguageIcon,
  },
];

interface Props {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

export function SortControl({ value, onChange }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];

  // 桌面浮層：點擊外部或按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(key: SortKey) {
    onChange(key);
    setOpen(false);
  }

  const list = (
    <ul className="flex flex-col">
      {OPTIONS.map(({ key, label, hint, Icon }) => {
        const active = key === value;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => pick(key)}
              className={`flex w-full items-center gap-3 px-4 text-left touch-target ${
                isMobile ? 'py-4' : 'py-3'
              } ${active ? 'bg-base-200' : 'hover:bg-base-200'}`}
              aria-pressed={active}
            >
              <Icon className="h-5 w-5 flex-none text-base-content/60" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-base-content/50">
                  {hint}
                </span>
              </span>
              {active && (
                <CheckIcon className="h-5 w-5 flex-none text-primary" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-sm gap-1.5 touch-target"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`排序方式：${current.label}`}
      >
        <ArrowsUpDownIcon className="h-4 w-4" />
        <span className="font-normal">{current.label}</span>
      </button>

      {open &&
        (isMobile ? (
          // 手機：底部滑出選單，大觸控目標
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
            onClick={() => setOpen(false)}
          >
            <div
              className="rounded-t-2xl bg-base-100 pb-[env(safe-area-inset-bottom)] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pb-1 pt-3 text-xs font-semibold text-base-content/50">
                排序方式
              </div>
              {list}
            </div>
          </div>
        ) : (
          // 桌面：錨定按鈕下方的小浮層
          <div className="absolute right-0 top-full z-50 mt-1 w-60 border border-base-300 bg-base-100 shadow-lg">
            {list}
          </div>
        ))}
    </div>
  );
}
