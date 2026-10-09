/** 本地金庫存取層：meta 與密文條目的 CRUD（不涉及解密） */
import type { EncryptedEntry } from '@/types/entry';
import type { VaultKeyset } from '@/crypto/vaultSetup';
import type { PasskeyKeyset } from '@/crypto/passkey';
import { db, type VaultMeta } from './dexie';

export async function getMeta(): Promise<VaultMeta | undefined> {
  return db.meta.get('self');
}

export async function hasVault(): Promise<boolean> {
  return (await db.meta.count()) > 0;
}

export async function saveMeta(keyset: VaultKeyset): Promise<void> {
  const now = Date.now();
  const existing = await getMeta();
  await db.meta.put({
    id: 'self',
    ...keyset,
    vaultRev: existing ? existing.vaultRev : 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

/** 換主密碼後只更新 kdfParams / wrappedVK_byMEK */
export async function updateMekWrap(
  kdfParams: VaultKeyset['kdfParams'],
  wrappedVK_byMEK: VaultKeyset['wrappedVK_byMEK'],
): Promise<void> {
  await db.meta.update('self', {
    kdfParams,
    wrappedVK_byMEK,
    updatedAt: Date.now(),
  });
}

/** 全部密文記錄（含墓碑）——同步合併用。 */
export async function listEncryptedEntries(): Promise<EncryptedEntry[]> {
  return db.entries.orderBy('updatedAt').reverse().toArray();
}

/** 僅「存活」的密文記錄（排除墓碑）——解密 / 顯示用。 */
export async function listLiveEntries(): Promise<EncryptedEntry[]> {
  return (await listEncryptedEntries()).filter((e) => !e.deleted);
}

export async function getEncryptedEntry(
  id: string,
): Promise<EncryptedEntry | undefined> {
  return db.entries.get(id);
}

/** 取得某條目的下一個 rev（現有 rev + 1，新條目為 1） */
export async function nextRev(id: string): Promise<number> {
  const existing = await db.entries.get(id);
  return (existing?.rev ?? 0) + 1;
}

export async function putEncryptedEntry(record: EncryptedEntry): Promise<void> {
  await db.entries.put(record);
}

export async function bulkPutEncrypted(
  records: EncryptedEntry[],
): Promise<void> {
  await db.entries.bulkPut(records);
}

/** 覆寫本機 meta（換主密碼 / 復原 / 從遠端合併後使用） */
export async function replaceMeta(meta: VaultMeta): Promise<void> {
  await db.meta.put(meta);
}

/** 啟用/更新本機指紋解鎖包裝（PRF），絕不上傳 */
export async function savePasskey(passkey: PasskeyKeyset): Promise<void> {
  await db.meta.update('self', { passkey, updatedAt: Date.now() });
}

/** 移除本機指紋解鎖 */
export async function clearPasskey(): Promise<void> {
  await db.meta.update('self', { passkey: undefined, updatedAt: Date.now() });
}

/** 設定整體版本號 vaultRev（主密碼變更時遞增） */
export async function setVaultRev(vaultRev: number): Promise<void> {
  await db.meta.update('self', { vaultRev, updatedAt: Date.now() });
}

/** 首次同步時把金庫綁定到雲端帳戶 uid（本機專用、絕不上傳）。 */
export async function setBoundUid(uid: string): Promise<void> {
  await db.meta.update('self', { boundUid: uid });
}

/** 記錄增量同步進度（本機專用欄位，絕不上傳）。 */
export async function updateSyncState(
  state: Pick<VaultMeta, 'syncWatermark' | 'lastFullSyncAt'>,
): Promise<void> {
  await db.meta.update('self', state);
}

/**
 * 依連續失敗次數計算鎖定毫秒數（漸增退避，抵抗離線暴力破解）。
 * 前 2 次不鎖；之後 5s → 30s → 1m → 5m，最高 5 分鐘。
 */
export function lockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts < 5) return 5_000;
  if (failedAttempts < 7) return 30_000;
  if (failedAttempts < 10) return 60_000;
  return 5 * 60_000;
}

/** 記錄一次解鎖失敗：遞增計數並依退避表設定鎖定到期時間。回傳更新後狀態。 */
export async function recordUnlockFailure(): Promise<{
  failedAttempts: number;
  lockoutUntil: number;
}> {
  const meta = await getMeta();
  const failedAttempts = (meta?.failedAttempts ?? 0) + 1;
  const lockoutUntil = Date.now() + lockoutDurationMs(failedAttempts);
  await db.meta.update('self', { failedAttempts, lockoutUntil });
  return { failedAttempts, lockoutUntil };
}

/** 解鎖成功後清除失敗計數與鎖定。 */
export async function clearUnlockFailures(): Promise<void> {
  await db.meta.update('self', { failedAttempts: 0, lockoutUntil: 0 });
}

/**
 * 清除超過 maxAgeMs 的墓碑（已刪除且早於門檻者）。回傳被清除的 id 清單，
 * 供呼叫端一併刪除遠端文件。預設 30 天——足夠讓所有裝置都同步到刪除事件。
 */
export async function gcTombstones(
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): Promise<string[]> {
  const cutoff = Date.now() - maxAgeMs;
  const stale = (await listEncryptedEntries()).filter(
    (e) => e.deleted && e.updatedAt < cutoff,
  );
  if (stale.length === 0) return [];
  const ids = stale.map((e) => e.id);
  await db.entries.bulkDelete(ids);
  return ids;
}

/**
 * 刪除條目：寫入墓碑（保留 id、遞增 rev、清空密文），而非實際移除。
 * 墓碑會在下次同步推送到遠端，讓其他裝置一併刪除。
 */
export async function deleteEntry(id: string): Promise<void> {
  const existing = await db.entries.get(id);
  await db.entries.put({
    id,
    ciphertext: '',
    iv: '',
    rev: (existing?.rev ?? 0) + 1,
    updatedAt: Date.now(),
    deleted: true,
    baseRev: existing?.baseRev,
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.meta, db.entries, async () => {
    await db.meta.clear();
    await db.entries.clear();
  });
}
