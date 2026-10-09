/**
 * Firestore 讀寫層。只送 / 收密文與非敏感欄位（嚴格對齊 firestore.rules 白名單）。
 * 路徑：users/{uid}（meta）、users/{uid}/entries/{id}（密文條目）。
 *
 * 每筆條目寫入時附上 serverUpdatedAt（伺服器時間，規則強制 == request.time），
 * 讓同步只需查詢「上次同步後變更的條目」，讀取量不再隨金庫大小成長。
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
  query,
  where,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from '@/firebase/app';
import type { EncryptedEntry } from '@/types/entry';
import type { KdfParams } from '@/crypto/kdf';
import type { WrappedKey } from '@/crypto/keyWrap';

export interface RemoteMetaDoc {
  kdfParams: KdfParams;
  /** 可選：免密碼金庫沒有主密碼包裝。 */
  wrappedVK_byMEK?: WrappedKey;
  wrappedVK_byRK: WrappedKey;
  vaultRev: number;
  updatedAt: number;
}

/**
 * 增量查詢往回多查的時間：伺服器時間戳與提交可見順序可能有些微交錯，
 * 重疊一段時間確保不漏；重複取回的條目在合併時視為未變更，無副作用。
 */
const WATERMARK_OVERLAP_MS = 60_000;

/** 剝除 baseRev 等本機專用欄位，只保留 Firestore 白名單允許的欄位 */
function toRemoteEntry(e: EncryptedEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ciphertext: e.ciphertext,
    iv: e.iv,
    rev: e.rev,
    updatedAt: e.updatedAt,
    serverUpdatedAt: serverTimestamp(),
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
  // Firestore 不接受 undefined 欄位；免密碼金庫省略 wrappedVK_byMEK。
  const data: Record<string, unknown> = {
    kdfParams: meta.kdfParams,
    wrappedVK_byRK: meta.wrappedVK_byRK,
    vaultRev: meta.vaultRev,
    updatedAt: meta.updatedAt,
  };
  if (meta.wrappedVK_byMEK) data.wrappedVK_byMEK = meta.wrappedVK_byMEK;
  await setDoc(doc(getDb(), 'users', uid), data);
}

export interface RemoteEntriesPage {
  entries: EncryptedEntry[];
  /** 本批條目中最大的 serverUpdatedAt（ms）；沒有任何帶時間戳的條目時為 null。 */
  maxServerTime: number | null;
}

/**
 * 取回遠端條目。給 sinceMs 時為增量查詢（只取該時間後變更者），否則取回全部。
 * 舊版客戶端寫入、沒有 serverUpdatedAt 的條目只會出現在完整查詢中。
 */
export async function fetchRemoteEntriesPage(
  uid: string,
  sinceMs?: number,
): Promise<RemoteEntriesPage> {
  const col = collection(getDb(), 'users', uid, 'entries');
  const snap = await getDocs(
    sinceMs === undefined
      ? col
      : query(col, where('serverUpdatedAt', '>', Timestamp.fromMillis(sinceMs - WATERMARK_OVERLAP_MS))),
  );
  let maxServerTime: number | null = null;
  const entries = snap.docs.map((d) => {
    const { entry, serverTime } = fromRemoteDoc(d);
    if (serverTime !== null && (maxServerTime === null || serverTime > maxServerTime)) {
      maxServerTime = serverTime;
    }
    return entry;
  });
  return { entries, maxServerTime };
}

export async function fetchRemoteEntries(
  uid: string,
): Promise<EncryptedEntry[]> {
  return (await fetchRemoteEntriesPage(uid)).entries;
}

/** Firestore 文件 → 本機條目（serverUpdatedAt 只用於同步水位，不存入本機）。 */
function fromRemoteDoc(d: QueryDocumentSnapshot<DocumentData>): {
  entry: EncryptedEntry;
  serverTime: number | null;
} {
  const { serverUpdatedAt, ...rest } = d.data();
  return {
    entry: { id: d.id, ...rest } as EncryptedEntry,
    serverTime: serverUpdatedAt instanceof Timestamp ? serverUpdatedAt.toMillis() : null,
  };
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
 * 條目只訂閱 sinceMs 之後的變更：訂閱建立時不必把整個集合讀一遍（每筆都計費）。
 * 回呼會帶上 `fromSelf`：本裝置自己尚未確認的寫入（hasPendingWrites）為 true，
 * 呼叫端可據此略過自己造成的回音、只對「真正來自他處」的變更觸發同步。
 * 回傳取消訂閱函式。
 */
export function subscribeRemote(
  uid: string,
  sinceMs: number,
  onChange: (info: { fromSelf: boolean; fromCache: boolean }) => void,
): () => void {
  const db = getDb();
  const emit = (meta: { hasPendingWrites: boolean; fromCache: boolean }) =>
    onChange({ fromSelf: meta.hasPendingWrites, fromCache: meta.fromCache });

  const unsubEntries = onSnapshot(
    query(
      collection(db, 'users', uid, 'entries'),
      where('serverUpdatedAt', '>', Timestamp.fromMillis(sinceMs)),
    ),
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
