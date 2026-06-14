/**
 * 智慧匯入主管線：雜亂文字 → 候選清單（供使用者逐張確認）。
 *
 * 流程：canonicalize → segment → parseBlock(FSM) → score → ImportCandidate[]
 * 全程在本機記憶體執行，不發任何網路請求；輸出由 UI 逐張確認後才寫入金庫。
 */
import type { ServiceEntry } from '@/types/entry';
import type { ImportCandidate } from '@/types/import';
import { newId } from '@/lib/id';
import { normalize } from '@/search/normalize';
import { canonicalize } from './canonicalize';
import { segment } from './segment';
import { parseBlock } from './fsm';
import { scoreCandidate } from './score';

/**
 * 解析貼上的文字。可選傳入既有條目以標記疑似重複。
 */
export function parseImport(
  raw: string,
  existing: ServiceEntry[] = [],
): ImportCandidate[] {
  const text = canonicalize(raw);
  if (!text) return [];

  const dupIndex = buildDuplicateIndex(existing);
  const candidates: ImportCandidate[] = [];

  for (const block of segment(text)) {
    const { fields, confidence } = parseBlock(block);
    // 完全空白的區塊略過
    if (Object.keys(fields).length === 0) continue;

    const { quality, needsReview } = scoreCandidate(fields, confidence);
    const duplicateOf = findDuplicate(fields, dupIndex);

    candidates.push({
      id: newId(),
      fields,
      confidence,
      quality,
      rawBlock: block,
      needsReview: needsReview || Boolean(duplicateOf),
      duplicateOf,
    });
  }

  return candidates;
}

function buildDuplicateIndex(existing: ServiceEntry[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const e of existing) {
    if (e.service) idx.set(normalize(e.service), e.service);
    for (const a of e.aliases) idx.set(normalize(a), e.service);
  }
  return idx;
}

function findDuplicate(
  fields: { service?: string },
  idx: Map<string, string>,
): string | undefined {
  if (!fields.service) return undefined;
  return idx.get(normalize(fields.service));
}

/** 把確認後的候選轉成可寫入金庫的 ServiceEntry。 */
export function candidateToEntry(c: ImportCandidate): ServiceEntry {
  const now = Date.now();
  const { service, username, password, otp, url, note } = c.fields;
  return {
    id: newId(),
    service: service?.trim() || '未命名',
    aliases: [],
    url: url?.trim() || undefined,
    tags: [],
    credentials: [
      {
        id: newId(),
        username: username?.trim() || undefined,
        password: password || undefined,
        otp: otp?.trim() || undefined,
        note: note?.trim() || undefined,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
