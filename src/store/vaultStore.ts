/**
 * 金庫 session 狀態（Zustand）。
 * VK 與解密後的條目只存在記憶體；閒置逾時自動上鎖並清除金鑰。
 */
import { create } from 'zustand';
import type { ServiceEntry } from '@/types/entry';
import {
  createVault,
  unlockWithMasterPassword,
} from '@/crypto/vaultSetup';
import { decryptEntry, encryptEntry } from '@/crypto/vault';
import { deriveAliases } from '@/search/alias';
import {
  deleteEntry as dbDelete,
  getMeta,
  hasVault,
  listEncryptedEntries,
  putEncryptedEntry,
  saveMeta,
} from '@/db/repo';

export type VaultStatus = 'loading' | 'no-vault' | 'locked' | 'unlocked';

const AUTO_LOCK_MS = 5 * 60 * 1000;

interface VaultState {
  status: VaultStatus;
  entries: ServiceEntry[];
  error: string | null;
  vk: CryptoKey | null;
  lastRecoveryCode: string | null; // 一次性顯示後即清除
  autoLockTimer: ReturnType<typeof setTimeout> | null;

  init: () => Promise<void>;
  create: (masterPassword: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;
  touch: () => void;
  saveEntry: (entry: ServiceEntry) => Promise<void>;
  saveMany: (entries: ServiceEntry[]) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  clearRecoveryCode: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  status: 'loading',
  entries: [],
  error: null,
  vk: null,
  lastRecoveryCode: null,
  autoLockTimer: null,

  init: async () => {
    set({ status: (await hasVault()) ? 'locked' : 'no-vault' });
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
      });
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
    try {
      const vk = await unlockWithMasterPassword(masterPassword, meta);
      const encrypted = await listEncryptedEntries();
      const entries = await Promise.all(
        encrypted.map((rec) => decryptEntry(rec, vk)),
      );
      get().touch();
      set({ vk, entries, status: 'unlocked' });
    } catch {
      // AES-GCM 驗證失敗 → 主密碼錯誤
      set({ error: '主密碼錯誤，請再試一次' });
    }
  },

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
    await putEncryptedEntry(await encryptEntry(enriched, vk));
    const next = entries.filter((e) => e.id !== enriched.id);
    next.unshift(enriched);
    get().touch();
    set({ entries: next });
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
      await putEncryptedEntry(await encryptEntry(e, vk));
    }
    const ids = new Set(enriched.map((e) => e.id));
    const next = [...enriched, ...entries.filter((e) => !ids.has(e.id))];
    get().touch();
    set({ entries: next });
  },

  removeEntry: async (id) => {
    await dbDelete(id);
    set({ entries: get().entries.filter((e) => e.id !== id) });
  },

  clearRecoveryCode: () => set({ lastRecoveryCode: null }),
}));

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : '發生未知錯誤';
}
