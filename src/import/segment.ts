/**
 * 區塊切分：把整段正規化文字切成「每筆一個區塊」。
 * 啟發式：明確分隔線、空行；若整段無分隔且偵測到重複 schema，則依重複的
 * 起始標籤切分（例如每筆都以「服務:」或網域開頭）。
 */
import { toLines } from './canonicalize';
import { splitLabeled } from './canonicalize';
import { labelToField } from './labels';
import { isUrl } from './tokens';

const HARD_DIVIDER = /^\s*(-{3,}|={3,}|\*{3,}|—{2,}|_{3,}|#{2,})\s*$/;

/** 回傳區塊字串陣列（每個區塊內仍是多行文字）。 */
export function segment(text: string): string[] {
  if (!text.trim()) return [];

  // 1) 明確分隔線優先
  const byDivider = splitByDivider(text);
  if (byDivider.length > 1) return byDivider.filter((b) => b.trim());

  // 2) 空行分隔
  const byBlank = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  // 3) 單一大區塊：嘗試以重複 schema 切分
  const single = byBlank[0] ?? text.trim();
  const bySchema = splitByRepeatedSchema(single);
  return bySchema.length > 1 ? bySchema : [single];
}

function splitByDivider(text: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of text.split('\n')) {
    if (HARD_DIVIDER.test(line)) {
      blocks.push(cur.join('\n'));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  blocks.push(cur.join('\n'));
  return blocks;
}

/**
 * 無空行的連續清單：若偵測到「起始欄位」週期性重複（例如每筆都從 service 或
 * url 開頭），就在每個起始點切一刀。
 */
function splitByRepeatedSchema(block: string): string[] {
  const lines = toLines(block);
  if (lines.length < 4) return [block];

  const starterIdx: number[] = [];
  lines.forEach((line, i) => {
    if (isBlockStarter(line)) starterIdx.push(i);
  });

  // 需要至少兩個起始點、且非每行都是起始點
  if (starterIdx.length < 2 || starterIdx.length === lines.length) {
    return [block];
  }

  const out: string[] = [];
  for (let s = 0; s < starterIdx.length; s++) {
    const from = starterIdx[s];
    const to = s + 1 < starterIdx.length ? starterIdx[s + 1] : lines.length;
    out.push(lines.slice(from, to).join('\n'));
  }
  // 第一個起始點之前的孤兒行併入第一筆
  if (starterIdx[0] > 0) {
    out[0] = lines.slice(0, starterIdx[1] ?? lines.length).join('\n');
  }
  return out.filter((b) => b.trim());
}

/** 一行是否「像一筆的開頭」：service 標籤、或裸網址/網域。 */
function isBlockStarter(line: string): boolean {
  const { label, value } = splitLabeled(line);
  if (label && labelToField(label) === 'service') return true;
  if (!label && isUrl(value)) return true;
  return false;
}
