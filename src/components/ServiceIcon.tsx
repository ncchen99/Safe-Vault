/**
 * 服務頭像：方形格子內，依序嘗試
 *   品牌 icon（simple-icons 精選，彩色）→ 分類字形 → 服務名前兩字。
 * 全程本機，永不連網。品牌底色用官方品牌色，logo 依對比自動取白或深色，
 * 像真實 App 圖示般好辨識。
 */
import { useMemo } from 'react';
import type { ServiceEntry } from '@/types/entry';
import { matchBrandSlug, matchConcept, BY_SLUG } from '@/icons/match';
import { CONCEPT_GLYPHS } from '@/icons/glyphs';

interface Props {
  entry: ServiceEntry;
  /** 方格邊長（Tailwind 尺寸 class 由父層控制時可忽略） */
  className?: string;
}

/** 依底色亮度決定 logo 用白或深色（WCAG 相對亮度近似）。 */
function readableOn(hex: string): string {
  const h = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.6 ? '#1c1917' : '#ffffff'; // 亮底→深 logo；暗底→白 logo
}

export function ServiceIcon({ entry, className = 'h-10 w-10' }: Props) {
  const resolved = useMemo(() => {
    const slug = matchBrandSlug(entry);
    if (slug) {
      const brand = BY_SLUG.get(slug);
      if (brand) return { kind: 'brand' as const, brand };
    }
    const concept = matchConcept(entry);
    if (concept && CONCEPT_GLYPHS[concept]) {
      return { kind: 'glyph' as const, Glyph: CONCEPT_GLYPHS[concept] };
    }
    return { kind: 'letters' as const };
  }, [entry]);

  if (resolved.kind === 'brand') {
    const bg = `#${resolved.brand.hex}`;
    const fg = readableOn(resolved.brand.hex);
    return (
      <div
        className={`flex flex-none items-center justify-center rounded-lg ring-1 ring-black/5 ${className}`}
        style={{ backgroundColor: bg }}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-1/2 w-1/2"
          fill={fg}
          role="img"
          aria-label={resolved.brand.title}
        >
          <path d={resolved.brand.path} />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-none items-center justify-center rounded-lg bg-base-300 text-base-content/70 ${className}`}
      aria-hidden
    >
      {resolved.kind === 'glyph' && <resolved.Glyph className="h-1/2 w-1/2" />}
      {resolved.kind === 'letters' && (
        <span className="text-sm font-semibold uppercase">
          {entry.service.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
