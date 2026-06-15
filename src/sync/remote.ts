/**
 * Firestore 讀寫層。只送 / 收密文與非敏感欄位（嚴格對齊 firestore.rules 白名單）。
 * 路徑：users/{uid}（meta）、users/{uid}/entries/{id}（密文條目）。
 */
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { getDb } from '@/firebase/app';
import type { EncryptedEntry } from '@/types/entry';
import type { KdfParams } from '@/crypto/kdf';
import type { WrappedKey } from '@/crypto/keyWrap';

export interface RemoteMetaDoc {
  kdfParams: KdfParams;
  wrappedVK_byMEK: WrappedKey;
  wrappedVK_byRK: WrappedKey;
  vaultRev: number;
  updatedAt: number;
}

/** 剝除 baseRev 等本機專用欄位，只保留 Firestore 白名單允許的欄位 */
function toRemoteEntry(e: EncryptedEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ciphertext: e.ciphertext,
    iv: e.iv,
    rev: e.rev,
    updatedAt: e.updatedAt,
  };
  if (e.conflictOf) out.conflictOf = e.conflictOf;
  if (e.deleted) out.deleted = true; // 墓碑：跨裝置傳播刪除
  return out;
}

export async function fetchRemoteMeta(
  uid: string,
): Promise<RemoteMetaDoc | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid));
  return snap.exists() ? (snap.data() as RemoteMetaDoc) : null;
}

export async function pushRemoteMeta(
  uid: string,
  meta: RemoteMetaDoc,
): Promise<void> {
  await setDoc(doc(getDb(), 'users', uid), {
    kdfParams: meta.kdfParams,
    wrappedVK_byMEK: meta.wrappedVK_byMEK,
    wrappedVK_byRK: meta.wrappedVK_byRK,
    vaultRev: meta.vaultRev,
    updatedAt: meta.updatedAt,
  });
}

export async function fetchRemoteEntries(
  uid: string,
): Promise<EncryptedEntry[]> {
  const snap = await getDocs(collection(getDb(), 'users', uid, 'entries'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as EncryptedEntry);
}

export async function pushRemoteEntries(
  uid: string,
  entries: EncryptedEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = getDb();
  // Firestore 批次上限 500，分批寫入
  for (let i = 0; i < entries.length; i += 450) {
    const batch = writeBatch(db);
    for (const e of entries.slice(i, i + 450)) {
      batch.set(doc(db, 'users', uid, 'entries', e.id), toRemoteEntry(e));
    }
    await batch.commit();
  }
}

export async function deleteRemoteEntry(
  uid: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'entries', id));
}

/**
 * 即時訂閱遠端條目與 meta 的變更（其他裝置推送時觸發）。
 * 回呼會帶上 `fromSelf`：本裝置自己尚未確認的寫入（hasPendingWrites）為 true，
 * 呼叫端可據此略過自己造成的回音、只對「真正來自他處」的變更觸發同步。
 * 回傳取消訂閱函式。
 */
export function subscribeRemote(
  uid: string,
  onChange: (info: { fromSelf: boolean; fromCache: boolean }) => void,
): () => void {
  const db = getDb();
  const emit = (meta: { hasPendingWrites: boolean; fromCache: boolean }) =>
    onChange({ fromSelf: meta.hasPendingWrites, fromCache: meta.fromCache });

  const unsubEntries = onSnapshot(
    collection(db, 'users', uid, 'entries'),
    (snap) => emit(snap.metadata),
  );
  const unsubMeta = onSnapshot(doc(db, 'users', uid), (snap) =>
    emit(snap.metadata),
  );
  return () => {
    unsubEntries();
    unsubMeta();
  };
}

export { toRemoteEntry };
