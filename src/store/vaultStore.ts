/**
 * 金庫 session 狀態（Zustand）。
 * VK 與解密後的條目只存在記憶體；閒置逾時自動上鎖並清除金鑰。
 */
import { create } from 'zustand';
import type { EncryptedEntry, ServiceEntry } from '@/types/entry';
import {
  createVault,
  createPasswordlessVault,
  unlockWithMasterPassword,
  recoverWithCode,
  rekeyVault,
} from '@/crypto/vaultSetup';
import { decryptEntry, encryptEntry } from '@/crypto/vault';
import {
  enablePasskey as cryptoEnablePasskey,
  isPasskeySupported,
  unlockVKWithPasskey,
} from '@/crypto/passkey';
import { deriveAliases } from '@/search/alias';
import { syncBus } from '@/sync/bus';
import {
  bulkPutEncrypted,
  clearPasskey,
  clearUnlockFailures,
  deleteEntry as dbDelete,
  getEncryptedEntry,
  getMeta,
  listLiveEntries,
  putEncryptedEntry,
  recordUnlockFailure,
  replaceMeta,
  saveMeta,
  savePasskey,
  setBoundUid,
} from '@/db/repo';
import type { SyncOutcome } from '@/sync/sync';

export type VaultStatus = 'loading' | 'no-vault' | 'locked' | 'unlocked';

const AUTO_LOCK_MS = 5 * 60 * 1000;

/** 設定 Passkey 需要可匯出 VK，但目前 session VK 不可匯出 → 需重新輸入主密碼驗證。 */
export class ReauthRequiredError extends Error {
  readonly code = 'REAUTH_REQUIRED';
  constructor() {
    super('請重新輸入主密碼以設定 Passkey');
    this.name = 'ReauthRequiredError';
  }
}

interface VaultState {
  status: VaultStatus;
  entries: ServiceEntry[];
  error: string | null;
  vk: CryptoKey | null;
  lastRecoveryCode: string | null; // 一次性顯示後即清除
  autoLockTimer: ReturnType<typeof setTimeout> | null;
  /** 此環境是否支援 Passkey（WebAuthn）。 */
  passkeySupported: boolean;
  /** 本機是否已啟用指紋解鎖。 */
  hasPasskey: boolean;
  /** 此金庫是否設有主密碼（免密碼金庫為 false）。 */
  hasMasterPassword: boolean;
  /** 解鎖後建議在此裝置設定 Passkey（例如用復原碼還原、或主密碼建立後）。 */
  suggestPasskey: boolean;
  /** 一次性旗標：剛採用雲端金庫（換新裝置）→ 下次解鎖後強制設定 Passkey。 */
  justAdopted: boolean;

  init: () => Promise<void>;
  create: (masterPassword: string) => Promise<void>;
  /** 免密碼建立：產生金庫 → 註冊指紋 Passkey（觸發 Touch ID）→ 解鎖。 */
  createWithPasskey: () => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  unlockWithPasskey: () => Promise<void>;
  /** 用復原碼解鎖（換裝置還原；不重設主密碼）。 */
  restoreWithCode: (recoveryCode: string) => Promise<void>;
  /**
   * 換裝置採用雲端既有金庫：拉取遠端 meta + 密文寫入本機，狀態轉為 locked。
   * 回傳 true 表示遠端有金庫（接著由解鎖頁用復原碼/指紋還原）。
   */
  tryAdoptRemoteVault: (uid: string) => Promise<boolean>;
  /** 啟用指紋；若 session VK 不可匯出，需傳入主密碼重新驗證（否則擲 ReauthRequiredError）。 */
  enablePasskey: (reauthPassword?: string) => Promise<void>;
  disablePasskey: () => Promise<void>;
  dismissPasskeySuggestion: () => void;
  lock: () => void;
  touch: () => void;
  saveEntry: (entry: ServiceEntry) => Promise<void>;
  saveMany: (entries: ServiceEntry[]) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  resetMasterPassword: (
    recoveryCode: string,
    newPassword: string,
  ) => Promise<void>;
  syncWithRemote: (uid: string) => Promise<SyncOutcome>;
  /** 一次性清理換裝置還原 bug 產生的內容相同副本；回傳刪除筆數。 */
  dedupeConflictCopies: (uid: string) => Promise<number>;
  clearRecoveryCode: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: 'loading',
  entries: [],
  error: null,
  vk: null,
  lastRecoveryCode: null,
  autoLockTimer: null,
  passkeySupported: isPasskeySupported(),
  hasPasskey: false,
  hasMasterPassword: false,
  suggestPasskey: false,
  justAdopted: false,

  init: async () => {
    const meta = await getMeta();
    set({
      status: meta ? 'locked' : 'no-vault',
      hasPasskey: Boolean(meta?.passkey),
      hasMasterPassword: Boolean(meta?.wrappedVK_byMEK),
    });
  },

  create: async (masterPassword) => {
    set({ error: null });
    try {
      const { recoveryCode, vk, ...keyset } = await createVault(masterPassword);
      await saveMeta(keyset);
      get().touch();
      set({
        vk,
        status: 'unlocked',
        entries: [],
        lastRecoveryCode: recoveryCode,
        hasMasterPassword: true,
        // 主密碼建立後，若此裝置支援指紋則建議啟用（更快解鎖）
        suggestPasskey: get().passkeySupported && !get().hasPasskey,
      });
      syncBus.emitLocalChange();
    } catch (e) {
      set({ error: errMsg(e) });
      throw e;
    }
  },

  /**
   * 免密碼建立金庫（預設路徑）：產生免密碼金庫 → 立刻註冊指紋 Passkey
   * 並以 PRF 包裝同一把 VK → 解鎖。完全不需輸入主密碼；復原碼為唯一可攜備援。
   * 若使用者取消指紋或裝置不支援 PRF，會擲回錯誤、不留下半套金庫，交由 UI 退回主密碼。
   */
  createWithPasskey: async () => {
    set({ error: null });
    try {
      const { recoveryCode, vk, ...keyset } = await createPasswordlessVault();
      // 先註冊指紋（會跳出 Touch ID）；失敗就中止，避免建立無法解鎖的金庫
      const passkey = await cryptoEnablePasskey(vk);
      await saveMeta(keyset);
      await savePasskey(passkey);
      get().touch();
      set({
        vk,
        status: 'unlocked',
        entries: [],
        lastRecoveryCode: recoveryCode,
        hasPasskey: true,
        hasMasterPassword: false,
        suggestPasskey: false,
      });
      syncBus.emitLocalChange();
    } catch (e) {
      set({ error: errMsg(e) });
      throw e;
    }
  },

  unlock: async (masterPassword) => {
    set({ error: null });
    const meta = await getMeta();
    if (!meta) {
      set({ error: '找不到本機金庫', status: 'no-vault' });
      return;
    }
    // #10 本機節流：鎖定期間直接拒絕，抵抗離線字典/暴力破解。
    const waitMs = (meta.lockoutUntil ?? 0) - Date.now();
    if (waitMs > 0) {
      set({ error: `嘗試過於頻繁，請於 ${Math.ceil(waitMs / 1000)} 秒後再試` });
      return;
    }
    try {
      const vk = await unlockWithMasterPassword(masterPassword, meta);
      const encrypted = await listLiveEntries();
      const entries = await Promise.all(
        encrypted.map((rec) => decryptEntry(rec, vk)),
      );
      await clearUnlockFailures();
      get().touch();
      // 換新裝置（剛採用雲端金庫）以主密碼解鎖後，強制設定 Passkey；
      // 同裝置日常解鎖不打擾（justAdopted 僅在採用時為 true，解鎖後即清除）。
      const suggestPasskey =
        get().justAdopted && get().passkeySupported && !get().hasPasskey;
      set({ vk, entries, status: 'unlocked', suggestPasskey, justAdopted: false });
      syncBus.emitLocalChange(); // 解鎖後若已登入則拉取遠端 + 啟動即時同步
    } catch {
      // AES-GCM 驗證失敗 → 主密碼錯誤
      const { failedAttempts, lockoutUntil } = await recordUnlockFailure();
      const lockMs = lockoutUntil - Date.now();
      set({
        error:
          lockMs > 0
            ? `主密碼錯誤，已連續失敗 ${failedAttempts} 次，請於 ${Math.ceil(
                lockMs / 1000,
              )} 秒後再試`
            : '主密碼錯誤，請再試一次',
      });
    }
  },

  /** 指紋解鎖：以 Passkey（PRF）解出 VK，等同主密碼解鎖但用生物辨識。 */
  unlockWithPasskey: async () => {
    set({ error: null });
    const meta = await getMeta();
    if (!meta?.passkey) {
      set({ error: '尚未啟用 Passkey 解鎖' });
      return;
    }
    try {
      const vk = await unlockVKWithPasskey(meta.passkey);
      const encrypted = await listLiveEntries();
      const entries = await Promise.all(
        encrypted.map((rec) => decryptEntry(rec, vk)),
      );
      await clearUnlockFailures();
      get().touch();
      set({ vk, entries, status: 'unlocked' });
      syncBus.emitLocalChange();
    } catch (e) {
      set({ error: errMsg(e) });
    }
  },

  /**
   * 用復原碼解鎖（換裝置還原的主要路徑）。只解出 VK 解鎖，不重設主密碼；
   * 解鎖後若此裝置支援指紋且尚未啟用 → 建議啟用，之後即可指紋快速解鎖。
   */
  restoreWithCode: async (recoveryCode) => {
    set({ error: null });
    const meta = await getMeta();
    if (!meta) {
      set({ error: '找不到本機金庫', status: 'no-vault' });
      return;
    }
    let vk: CryptoKey;
    try {
      vk = await recoverWithCode(recoveryCode.trim(), meta);
    } catch {
      set({ error: '復原碼錯誤，請確認後再試' });
      throw new Error('復原碼錯誤');
    }
    const encrypted = await listLiveEntries();
    const entries = await Promise.all(
      encrypted.map((rec) => decryptEntry(rec, vk)),
    );
    await clearUnlockFailures();
    get().touch();
    set({
      vk,
      entries,
      status: 'unlocked',
      suggestPasskey: get().passkeySupported && !get().hasPasskey,
      justAdopted: false,
    });
    syncBus.emitLocalChange();
  },

  /**
   * 換裝置採用雲端既有金庫：抓遠端 meta + 密文寫入本機，狀態轉 locked。
   * 不需要 VK（只搬密文）；回傳 true 表示遠端確實有金庫可還原。
   */
  tryAdoptRemoteVault: async (uid) => {
    const { fetchRemoteMeta, fetchRemoteEntries } = await import(
      '@/sync/remote'
    );
    const remoteMeta = await fetchRemoteMeta(uid);
    if (!remoteMeta) return false; // 雲端沒有金庫 → 視為新使用者
    const now = Date.now();
    await replaceMeta({
      id: 'self',
      kdfParams: remoteMeta.kdfParams,
      wrappedVK_byMEK: remoteMeta.wrappedVK_byMEK,
      wrappedVK_byRK: remoteMeta.wrappedVK_byRK,
      vaultRev: remoteMeta.vaultRev,
      createdAt: now,
      updatedAt: remoteMeta.updatedAt,
    });
    const entries = await fetchRemoteEntries(uid);
    // 採用遠端條目時必須標記 baseRev = rev（= 已與遠端同步於此 rev）。
    // baseRev 是本機專用欄位、上傳時被剝除，故 fetchRemoteEntries 取回時皆為 undefined。
    // 若直接寫入，首次同步會把每筆都判為「本機與遠端皆改過」→ 走衝突分支產生副本，
    // 導致換裝置還原後所有條目被複製一份。設定 baseRev 後首次同步才不會誤判。
    const adopted = entries.map((e) => ({ ...e, baseRev: e.rev }));
    if (adopted.length) await bulkPutEncrypted(adopted);
    set({
      status: 'locked',
      hasPasskey: false, // 新裝置尚未註冊本機 Passkey
      hasMasterPassword: Boolean(remoteMeta.wrappedVK_byMEK),
      justAdopted: true, // 新裝置：下次解鎖後強制設定 Passkey
    });
    return true;
  },

  /**
   * 啟用指紋解鎖：用目前記憶體中的 VK，建立 Passkey 並額外包裝一份 VK。
   *
   * 包裝（wrapKey）需要可匯出的 VK。建立/復原流程的 VK 本就可匯出，可直接使用；
   * 但日常主密碼/指紋解鎖得到的 VK 為不可匯出（#1），此時需重新輸入主密碼以取得
   * 可匯出 VK。未提供 reauthPassword 時擲回 ReauthRequiredError，由 UI 提示再輸入。
   */
  enablePasskey: async (reauthPassword?: string) => {
    const { vk } = get();
    if (!vk) throw new Error('金庫未解鎖');
    set({ error: null });
    let wrapVk = vk;
    if (!vk.extractable) {
      if (!reauthPassword) throw new ReauthRequiredError();
      const meta = await getMeta();
      if (!meta) throw new Error('找不到本機金庫');
      try {
        wrapVk = await unlockWithMasterPassword(reauthPassword, meta, true);
      } catch {
        throw new Error('主密碼錯誤，無法設定 Passkey');
      }
    }
    const passkey = await cryptoEnablePasskey(wrapVk);
    await savePasskey(passkey);
    set({ hasPasskey: true, suggestPasskey: false });
  },

  /** 停用指紋解鎖：移除本機 PRF 包裝（主密碼/復原碼不受影響）。 */
  disablePasskey: async () => {
    await clearPasskey();
    set({ hasPasskey: false });
  },

  dismissPasskeySuggestion: () => set({ suggestPasskey: false }),

  lock: () => {
    const { autoLockTimer } = get();
    if (autoLockTimer) clearTimeout(autoLockTimer);
    set({
      vk: null,
      entries: [],
      status: 'locked',
      error: null,
      autoLockTimer: null,
    });
  },

  touch: () => {
    const { autoLockTimer } = get();
    if (autoLockTimer) clearTimeout(autoLockTimer);
    const timer = setTimeout(() => get().lock(), AUTO_LOCK_MS);
    set({ autoLockTimer: timer });
  },

  saveEntry: async (entry) => {
    const { vk, entries } = get();
    if (!vk) throw new Error('金庫未解鎖');
    const enriched: ServiceEntry = {
      ...entry,
      aliases: dedupe([
        ...entry.aliases,
        ...deriveAliases(entry.service, entry.url),
      ]),
      updatedAt: Date.now(),
    };
    // 遞增 rev 但保留 baseRev（上次同步基準），讓同步能偵測到本機變更
    const prev = await getEncryptedEntry(enriched.id);
    const record = await encryptEntry(enriched, vk, (prev?.rev ?? 0) + 1);
    record.baseRev = prev?.baseRev;
    await putEncryptedEntry(record);
    const next = entries.filter((e) => e.id !== enriched.id);
    next.unshift(enriched);
    get().touch();
    set({ entries: next });
    syncBus.emitLocalChange();
  },

  saveMany: async (incoming) => {
    const { vk, entries } = get();
    if (!vk) throw new Error('金庫未解鎖');
    const enriched = incoming.map((entry) => ({
      ...entry,
      aliases: dedupe([
        ...entry.aliases,
        ...deriveAliases(entry.service, entry.url),
      ]),
      updatedAt: Date.now(),
    }));
    for (const e of enriched) {
      const prev = await getEncryptedEntry(e.id);
      const record = await encryptEntry(e, vk, (prev?.rev ?? 0) + 1);
      record.baseRev = prev?.baseRev;
      await putEncryptedEntry(record);
    }
    const ids = new Set(enriched.map((e) => e.id));
    const next = [...enriched, ...entries.filter((e) => !ids.has(e.id))];
    get().touch();
    set({ entries: next });
    syncBus.emitLocalChange();
  },

  removeEntry: async (id) => {
    await dbDelete(id);
    set({ entries: get().entries.filter((e) => e.id !== id) });
    syncBus.emitLocalChange();
  },

  /**
   * 忘記主密碼：以復原碼解回 VK → 用新主密碼重新包裝（並產生全新復原碼，
   * 使舊復原碼失效）→ 解鎖。整個過程在本機完成。
   */
  resetMasterPassword: async (recoveryCode, newPassword) => {
    set({ error: null });
    const meta = await getMeta();
    if (!meta) {
      set({ error: '找不到本機金庫', status: 'no-vault' });
      return;
    }
    let vk: CryptoKey;
    try {
      vk = await recoverWithCode(recoveryCode, meta);
    } catch {
      // AES-GCM 驗證失敗 → 復原碼錯誤
      set({ error: '復原碼錯誤，請確認後再試' });
      throw new Error('復原碼錯誤');
    }
    const keyset = await rekeyVault(vk, newPassword);
    await replaceMeta({
      ...meta,
      kdfParams: keyset.kdfParams,
      wrappedVK_byMEK: keyset.wrappedVK_byMEK,
      wrappedVK_byRK: keyset.wrappedVK_byRK,
      vaultRev: meta.vaultRev + 1, // 主密碼變更 → 遞增整體版本
      updatedAt: Date.now(),
    });
    const encrypted = await listLiveEntries();
    const entries = await Promise.all(
      encrypted.map((rec) => decryptEntry(rec, vk)),
    );
    get().touch();
    set({
      vk,
      entries,
      status: 'unlocked',
      hasMasterPassword: true, // 免密碼金庫設定主密碼後 → 標記為已設定
      lastRecoveryCode: keyset.recoveryCode,
    });
  },

  /** 與遠端雙向同步，完成後以記憶體中的 VK 重新解密本機條目 */
  syncWithRemote: async (uid) => {
    const { vk } = get();
    if (!vk) throw new Error('金庫未解鎖');

    // #3 帳戶綁定：金庫首次同步時綁定當前 uid；之後若登入帳戶不符即拒絕，
    // 避免誤切換/惡意切換帳號把密文推送到他人 UID。
    const meta = await getMeta();
    if (meta?.boundUid && meta.boundUid !== uid) {
      throw new Error(
        '此金庫已綁定其他雲端帳戶，為保護資料已停止同步。請改用原帳戶登入，或先登出再以原帳戶重新登入。',
      );
    }
    if (meta && !meta.boundUid) await setBoundUid(uid);

    // #4 衝突副本以新 id 重新加密（AAD 綁定 id）。同步層不持有 VK，故由此處注入。
    const reEncrypt = async (copy: EncryptedEntry): Promise<EncryptedEntry> => {
      // 墓碑（無密文）無須重新加密
      if (copy.deleted || !copy.ciphertext || !copy.conflictOf) return copy;
      const entry = await decryptEntry({ ...copy, id: copy.conflictOf }, vk);
      const re = await encryptEntry({ ...entry, id: copy.id }, vk, copy.rev);
      return { ...re, baseRev: copy.baseRev, conflictOf: copy.conflictOf };
    };

    // 動態載入同步鏈（含 Firebase SDK），純本地使用時不進入關鍵路徑
    const { syncNow } = await import('@/sync/sync');
    const outcome = await syncNow(uid, reEncrypt);
    // 同步可能下載/新增了條目或衝突副本 → 重新解密整份
    const encrypted = await listLiveEntries();
    const entries = await Promise.all(
      encrypted.map((rec) => decryptEntry(rec, vk)),
    );
    get().touch();
    set({ entries });

    // 一次性自動去重：清掉換裝置還原 bug 留下的內容相同副本（並推送墓碑給其他裝置）。
    // 全部清完後不再有 conflictOf 條目 → 後續同步自動略過，等同一次性、且跨裝置自癒。
    await get().dedupeConflictCopies(uid);
    return outcome;
  },

  /**
   * 清理「換裝置還原 bug」產生的內容相同副本：
   * 只刪除 conflictOf 指向之原條目仍在、且實質內容完全相同者（真正衝突副本不動）。
   * 刪除＝寫墓碑並同步，讓其他裝置一併移除。無此類副本時不做任何事（廉價略過）。
   */
  dedupeConflictCopies: async (uid) => {
    const { vk } = get();
    if (!vk) return 0;
    const encrypted = await listLiveEntries();
    // 無任何 conflictOf 條目 → 沒有可去重的副本（含已清理完畢）→ 直接略過，不解密。
    if (!encrypted.some((e) => e.conflictOf)) return 0;

    const { findDuplicateCopyIds } = await import('@/sync/dedup');
    const candidates = await Promise.all(
      encrypted.map(async (rec) => ({
        id: rec.id,
        conflictOf: rec.conflictOf,
        content: await decryptEntry(rec, vk),
      })),
    );
    const dupIds = findDuplicateCopyIds(candidates);
    if (dupIds.length === 0) return 0;

    const remove = new Set(dupIds);
    for (const id of dupIds) await dbDelete(id); // 寫墓碑（保留刪除標記以跨裝置傳播）
    set({ entries: get().entries.filter((e) => !remove.has(e.id)) });

    // 立即把墓碑推送到遠端，讓其他裝置同步移除重複。
    const { syncNow } = await import('@/sync/sync');
    await syncNow(uid);
    return dupIds.length;
  },

  clearRecoveryCode: () => set({ lastRecoveryCode: null }),
}));

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : '發生未知錯誤';
}
