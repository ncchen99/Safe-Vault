/**
 * 純函式同步合併邏輯（不接觸網路 / Firestore，方便單元測試）。
 *
 * 策略（依規格 §9.4）：條目級 Last-Write-Wins（以 updatedAt 後 rev 判定），
 * 但偵測到「雙方自上次同步後都改過同一條目」時，不直接覆蓋落敗版本，
 * 而是保留為一筆衝突副本（conflictOf 指向原條目），避免資料遺失。
 *
 * baseRev = 本機上次成功同步時的 rev；rev > baseRev 代表本機有未同步的修改。
 */
import type { EncryptedEntry } from '@/types/entry';

export interface MergeResult {
  /** 合併後本機應持有的完整條目集合 */
  resolved: EncryptedEntry[];
  /** 需要上傳到遠端的條目（含因衝突新產生的副本） */
  toPush: EncryptedEntry[];
  /** 因併發修改而新產生的衝突副本 */
  conflicts: EncryptedEntry[];
}

/** updatedAt 較新者勝；同時則 rev 較大者勝 */
function newer(a: EncryptedEntry, b: EncryptedEntry): EncryptedEntry {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return a.rev >= b.rev ? a : b;
}

export interface MergeOptions {
  /**
   * 增量同步：remote 只含「自上次同步後有變更」的條目，而非完整集合。
   * 此時「只在本機」不代表遠端沒有，而是遠端未變 → 只在本機有未同步修改時才推送。
   */
  partial?: boolean;
}

export function mergeEntries(
  local: EncryptedEntry[],
  remote: EncryptedEntry[],
  newId: () => string,
  { partial = false }: MergeOptions = {},
): MergeResult {
  const localById = new Map(local.map((e) => [e.id, e]));
  const remoteById = new Map(remote.map((e) => [e.id, e]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  const resolved: EncryptedEntry[] = [];
  const toPush: EncryptedEntry[] = [];
  const conflicts: EncryptedEntry[] = [];

  for (const id of ids) {
    const L = localById.get(id);
    const R = remoteById.get(id);

    // 增量同步且遠端此筆未變：本機有未同步修改（或從未同步）才上傳
    if (L && !R && partial && L.baseRev !== undefined && L.rev <= L.baseRev) {
      resolved.push(L);
      continue;
    }
    // 只在本機 → 上傳
    if (L && !R) {
      const synced = { ...L, baseRev: L.rev };
      resolved.push(synced);
      toPush.push(synced);
      continue;
    }
    // 只在遠端 → 下載採用
    if (R && !L) {
      resolved.push({ ...R, baseRev: R.rev });
      continue;
    }
    if (!L || !R) continue; // 不會發生，僅滿足型別收窄

    const base = L.baseRev ?? 0;
    const localChanged = L.rev > base;
    const remoteChanged = R.rev > base;

    if (!localChanged && !remoteChanged) {
      // 雙方都未動，已同步
      resolved.push({ ...L, baseRev: L.rev });
    } else if (localChanged && !remoteChanged) {
      // 只有本機改 → 推送
      const synced = { ...L, baseRev: L.rev };
      resolved.push(synced);
      toPush.push(synced);
    } else if (!localChanged && remoteChanged) {
      // 只有遠端改 → 下載採用
      resolved.push({ ...R, baseRev: R.rev });
    } else {
      // 雙方併發修改 → 衝突
      const winner = newer(L, R);
      const loser = winner === L ? R : L;
      const convergedRev = Math.max(L.rev, R.rev) + 1;
      const winnerResolved: EncryptedEntry = {
        ...winner,
        id,
        rev: convergedRev,
        baseRev: convergedRev,
        conflictOf: undefined,
      };
      const loserCopy: EncryptedEntry = {
        ...loser,
        id: newId(),
        rev: 1,
        baseRev: 1,
        conflictOf: id,
      };
      resolved.push(winnerResolved, loserCopy);
      toPush.push(winnerResolved, loserCopy);
      conflicts.push(loserCopy);
    }
  }

  return { resolved, toPush, conflicts };
}

export interface RemoteMeta {
  kdfParams: unknown;
  wrappedVK_byMEK?: unknown; // 免密碼金庫沒有主密碼包裝
  wrappedVK_byRK: unknown;
  vaultRev: number;
  updatedAt: number;
}

/** meta 合併：vaultRev 較大者勝（同時以 updatedAt 決勝）；回傳是否需推送本機版本 */
export function mergeMeta<T extends { vaultRev: number; updatedAt: number }>(
  local: T,
  remote: T | null,
): { meta: T; pushLocal: boolean } {
  if (!remote) return { meta: local, pushLocal: true };
  if (local.vaultRev > remote.vaultRev) return { meta: local, pushLocal: true };
  if (remote.vaultRev > local.vaultRev)
    return { meta: remote, pushLocal: false };
  // vaultRev 相同：以 updatedAt 決勝
  return local.updatedAt >= remote.updatedAt
    ? { meta: local, pushLocal: true }
    : { meta: remote, pushLocal: false };
}
