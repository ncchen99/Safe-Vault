/**
 * 文字正規化：把貼上的雜亂內容整理成乾淨、逐行的形式。
 * 不改變語意（不小寫化值），只統一格式以利後續切分與解析。
 */

// 零寬字元 / BOM：ZWSP, ZWNJ, ZWJ, BOM
const ZERO_WIDTH = /[​‌‍﻿]/g;
// 不斷行 / 各式空白
const NBSP = /[   ]/g;

/** 統一換行、移除零寬字元、修剪每行尾端空白、壓縮過多空行。 */
export function canonicalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n') // CRLF / CR → LF
    .replace(ZERO_WIDTH, '')
    .replace(NBSP, ' ')
    .replace(/[ \t]+\n/g, '\n') // 行尾空白
    .replace(/\n{3,}/g, '\n\n') // 3+ 連續空行 → 1 個分隔空行
    .trim();
}

/** 將一行拆成 { label, value }；無標籤時 label 為 undefined。 */
export function splitLabeled(line: string): {
  label?: string;
  value: string;
} {
  // 支援：label: value / label：value（全形）/ label\tvalue
  const colon = line.match(/^\s*([^\t:：]{1,24}?)\s*[:：\t]\s*(.+)$/);
  if (colon && colon[2].trim()) {
    const lbl = colon[1].trim();
    // 避免把 URI scheme（https://、otpauth://…）誤判為 label:value
    if (/^[a-z][a-z0-9+.-]*$/i.test(lbl) && colon[2].trim().startsWith('//')) {
      return { value: line.trim() };
    }
    return { label: lbl, value: colon[2].trim() };
  }
  // 支援：label - value（前後需有空白，避免切到含連字號的值）
  const dash = line.match(/^\s*([^\-–—]{1,24}?)\s+[-–—]\s+(.+)$/);
  if (dash && dash[2].trim()) {
    return { label: dash[1].trim(), value: dash[2].trim() };
  }
  return { value: line.trim() };
}

/** 拆成非空行陣列（保留區塊內順序）。 */
export function toLines(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
