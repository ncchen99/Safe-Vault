/**
 * 智慧匯入主管線：雜亂文字 → 候選清單（供使用者逐張確認）。
 *
 * 流程：canonicalize → segment → parseBlock(FSM) → score → ImportCandidate[]
 * 全程在本機記憶體執行，不發任何網路請求；輸出由 UI 逐張確認後才寫入金庫。
 */
import type { CustomField, ServiceEntry } from '@/types/entry';
import type { ImportCandidate } from '@/types/import';
import { newId } from '@/lib/id';
import { normalize } from '@/search/normalize';
import { canonicalServiceName } from '@/icons/match';
import { canonicalize } from './canonicalize';
import { segment, splitCredentials } from './segment';
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

  // segment 切出每筆；splitCredentials 再把「同服務多組帳密」拆成各自一筆。
  const blocks = segment(text).flatMap(splitCredentials);
  for (const block of blocks) {
    const { fields, confidence } = parseBlock(block);
    // 完全空白的區塊略過
    if (Object.keys(fields).length === 0) continue;

    const { quality, needsReview } = scoreCandidate(fields, confidence);
    const dup = findDuplicate(fields, dupIndex);

    candidates.push({
      id: newId(),
      fields,
      confidence,
      quality,
      rawBlock: block,
      needsReview: needsReview || Boolean(dup),
      duplicateOf: dup?.service,
      duplicateId: dup?.id,
    });
  }

  return candidates;
}

function buildDuplicateIndex(
  existing: ServiceEntry[],
): Map<string, ServiceEntry> {
  const idx = new Map<string, ServiceEntry>();
  for (const e of existing) {
    if (e.service) idx.set(normalize(e.service), e);
    // 既有服務名也比對其正規化後的標準名（FB → Facebook），與寫入時一致。
    const canon = canonicalServiceName(e.service);
    if (canon) idx.set(normalize(canon.name), e);
    for (const a of e.aliases) idx.set(normalize(a), e);
  }
  return idx;
}

function findDuplicate(
  fields: { service?: string },
  idx: Map<string, ServiceEntry>,
): ServiceEntry | undefined {
  if (!fields.service) return undefined;
  // 先比對原輸入，再比對其正規化標準名，兩者命中既有條目都算重複。
  const direct = idx.get(normalize(fields.service));
  if (direct) return direct;
  const canon = canonicalServiceName(fields.service);
  return canon ? idx.get(normalize(canon.name)) : undefined;
}

/**
 * 把確認後的候選轉成可寫入金庫的 ServiceEntry。
 *
 * 傳入 `existing`（候選命中的既有條目）時改為「併入既有條目」而非新建一筆：
 *  - 既有條目已有相同帳號＋密碼 → 視為完全重複，回傳 null（不寫入，避免複製）。
 *  - 否則把此候選的憑證附加為既有條目的另一組帳密，沿用既有 id。
 * 沿用既有 id 是關鍵：同步以 id 配對，重複貼上同份資料才不會跨裝置變成兩份。
 */
export function candidateToEntry(
  c: ImportCandidate,
  existing?: ServiceEntry,
): ServiceEntry | null {
  const now = Date.now();
  const { service, username, password, otp, url, note, fields } = c.fields;
  const raw = service?.trim() || '未命名';
  // 服務名正規化：FB / 臉書 → Facebook；原輸入保留為別名以利搜尋。
  const canon = canonicalServiceName(raw);
  const name = canon?.name ?? raw;
  const aliases = canon && canon.name !== raw ? [raw] : [];

  // 服務名夾帶的使用者標記（如 Fb黏誠 → 黏誠）移入備註，標明此帳號屬於哪位使用者。
  const noteVal = [canon?.descriptor, note?.trim()].filter(Boolean).join('\n') || undefined;

  const custom: CustomField[] | undefined = fields?.length
    ? fields.map((f) => ({
        id: newId(),
        label: f.label,
        value: f.value,
        secret: f.secret,
      }))
    : undefined;

  const credential = {
    id: newId(),
    username: username?.trim() || undefined,
    password: password || undefined,
    otp: otp?.trim() || undefined,
    note: noteVal,
    fields: custom,
  };

  if (existing) {
    // 既有條目已含相同帳號＋密碼 → 完全重複，跳過。
    const dup = existing.credentials.some(
      (cr) =>
        (cr.username ?? '') === (credential.username ?? '') &&
        (cr.password ?? '') === (credential.password ?? ''),
    );
    if (dup) return null;
    // 不同帳號 → 併入既有條目作為另一組憑證，沿用既有 id。既有條目缺 url 時補上。
    return {
      ...existing,
      url: existing.url ?? (url?.trim() || undefined),
      credentials: [...existing.credentials, credential],
      updatedAt: now,
    };
  }

  return {
    id: newId(),
    service: name,
    aliases,
    url: url?.trim() || undefined,
    tags: [],
    credentials: [credential],
    createdAt: now,
    updatedAt: now,
  };
}
