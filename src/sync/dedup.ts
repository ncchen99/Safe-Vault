/**
 * 一次性去重：清理「換裝置還原 bug」產生的內容相同副本。
 *
 * 背景：tryAdoptRemoteVault 曾把採用的遠端條目寫入本機卻未標記 baseRev，
 * 導致首次同步把每筆都誤判為併發修改 → 走衝突分支，為每筆產生一份 conflictOf 副本
 * （內容與原條目完全相同）。此模組找出這些「內容相同的副本」以便刪除。
 *
 * 安全性：只刪除「conflictOf 指向之原條目仍存在、且實質內容完全相同」者。
 * 真正的衝突副本（內容已不同）一律保留，不會誤刪使用者資料。純函式，方便測試。
 */
import type { ServiceEntry } from '@/types/entry';

/** 條目「實質內容」的正規化投影（忽略 id / 時間戳 / 衍生別名）。 */
function projection(e: ServiceEntry): string {
  return JSON.stringify({
    service: e.service,
    url: e.url ?? '',
    tags: [...e.tags].sort(),
    credentials: e.credentials.map((c) => ({
      username: c.username ?? '',
      password: c.password ?? '',
      otp: c.otp ?? '',
      note: c.note ?? '',
      fields: (c.fields ?? []).map((f) => ({
        label: f.label,
        value: f.value,
        secret: !!f.secret,
      })),
    })),
  });
}

/** 兩筆條目實質內容是否相同。 */
export function sameContent(a: ServiceEntry, b: ServiceEntry): boolean {
  return projection(a) === projection(b);
}

export interface DedupCandidate {
  id: string;
  conflictOf?: string;
  content: ServiceEntry;
}

/**
 * 回傳應刪除的重複副本 id：有 conflictOf、其指向之原條目仍存在、且內容完全相同。
 */
export function findDuplicateCopyIds(entries: DedupCandidate[]): string[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const remove: string[] = [];
  for (const e of entries) {
    if (!e.conflictOf) continue;
    const orig = byId.get(e.conflictOf);
    if (!orig) continue; // 原條目不在（可能已刪）→ 保守起見不刪副本
    if (sameContent(e.content, orig.content)) remove.push(e.id);
  }
  return remove;
}
