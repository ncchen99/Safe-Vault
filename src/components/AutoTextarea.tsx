/**
 * 自動長高的文字區：高度隨內容行數增減，不出現內部捲軸、不顯示手動拖曳把手。
 * 沿用 daisyUI textarea 樣式，className 由呼叫端傳入（含 min-height 等）。
 */
import { useLayoutEffect, useRef } from 'react';

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AutoTextarea({ value, className = '', ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}
