/**
 * 本地加密金庫儲存（IndexedDB via Dexie）。
 * 只存密文與金鑰包裝結果；解密只在記憶體進行。
 */
import Dexie, { type EntityTable } from 'dexie';
import type { EncryptedEntry } from '@/types/entry';
import type { VaultKeyset } from '@/crypto/vaultSetup';
import type { PasskeyKeyset } from '@/crypto/passkey';

/** 金庫中繼資料（單列，id 固定為 'self'） */
export interface VaultMeta extends VaultKeyset {
  id: 'self';
  vaultRev: number;
  createdAt: number;
  updatedAt: number;
  /** 本機指紋解鎖（WebAuthn PRF 包裝的 VK）。可選、絕不上傳。 */
  passkey?: PasskeyKeyset;
  /**
   * 此金庫綁定的雲端帳戶 uid（首次同步時寫入）。本機專用、絕不上傳。
   * 後續同步前會比對登入中的 uid；不符即拒絕，避免把密文推送到他人帳戶（#3）。
   */
  boundUid?: string;
  /**
   * 增量同步水位：已取回之遠端條目中最大的 serverUpdatedAt（伺服器時間 ms）。
   * 本機專用、絕不上傳。缺少時下次同步做完整拉取。
   */
  syncWatermark?: number;
  /** 上次完整同步（拉取全部遠端條目）的時間；定期做一次以自我校正。本機專用。 */
  lastFullSyncAt?: number;
  /** 連續解鎖失敗次數（成功後歸零）。用於本機節流，抵抗離線暴力破解（#10）。 */
  failedAttempts?: number;
  /** 解鎖鎖定到期時間戳（ms）。在此之前拒絕嘗試。 */
  lockoutUntil?: number;
}

const db = new Dexie('safevault') as Dexie & {
  meta: EntityTable<VaultMeta, 'id'>;
  entries: EntityTable<EncryptedEntry, 'id'>;
};

db.version(1).stores({
  meta: 'id',
  entries: 'id, updatedAt',
});

export { db };
