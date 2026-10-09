/**
 * Firestore Security Rules 測試（零知識邊界驗證）。
 *
 * 預設跳過：需要 `@firebase/rules-unit-testing` 與 Firestore Emulator。
 * 執行方式：
 *   npm i -D @firebase/rules-unit-testing
 *   firebase emulators:exec --config firebase/firebase.json --only firestore \
 *     "RUN_RULES_TESTS=true npx vitest run src/sync/rules.test.ts"
 *
 * 驗證重點：
 *  - 只能讀寫自己 uid 底下的資料（跨 uid 一律拒絕）
 *  - meta 與 entries 僅允許白名單欄位（防止意外寫入明文）
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

const RUN = process.env.RUN_RULES_TESTS === 'true';

// 條目 id 為 crypto.randomUUID()（規則限制 UUID 格式）
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const E3 = '33333333-3333-4333-8333-333333333333';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.skipIf(!RUN)('firestore.rules — 零知識存取邊界', () => {
  let testEnv: any;
  let assertFails: (p: Promise<unknown>) => Promise<unknown>;
  let assertSucceeds: (p: Promise<unknown>) => Promise<unknown>;
  /** 伺服器時間戳（規則要求條目的 serverUpdatedAt == request.time）。 */
  let ts: () => unknown;

  beforeAll(async () => {
    // 以變數間接 import，避免未安裝相依時 tsc 解析失敗
    const moduleName = '@firebase/rules-unit-testing';
    const rut: any = await import(/* @vite-ignore */ moduleName);
    assertFails = rut.assertFails;
    assertSucceeds = rut.assertSucceeds;
    const compat: any = (await import(/* @vite-ignore */ 'firebase/compat/app')).default;
    await import(/* @vite-ignore */ 'firebase/compat/firestore');
    ts = () => compat.firestore.FieldValue.serverTimestamp();
    testEnv = await rut.initializeTestEnvironment({
      projectId: 'safevault-rules-test',
      firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('允許讀寫自己的 meta（白名單欄位）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      db.doc('users/alice').set({
        kdfParams: { algo: 'argon2id', salt: 'x' },
        wrappedVK_byMEK: { ct: 'a', iv: 'b' },
        wrappedVK_byRK: { ct: 'a', iv: 'b' },
        vaultRev: 1,
        updatedAt: 1,
      }),
    );
  });

  it('允許免密碼金庫的 meta（省略 wrappedVK_byMEK）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      db.doc('users/alice').set({
        kdfParams: { algo: 'argon2id', salt: 'x' },
        wrappedVK_byRK: { ct: 'a', iv: 'b' },
        vaultRev: 1,
        updatedAt: 1,
      }),
    );
  });

  it('拒絕讀取他人 uid 的資料', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(db.doc('users/bob').get());
  });

  it('拒絕未授權欄位（防止明文外洩）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(
      db.doc(`users/alice/entries/${E1}`).set({
        ciphertext: 'c',
        iv: 'i',
        serverUpdatedAt: ts(),
        rev: 1,
        updatedAt: 1,
        plaintextPassword: 'oops', // 不在白名單 → 應被拒
      }),
    );
  });

  it('允許寫入白名單內的密文條目', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(
      db.doc(`users/alice/entries/${E2}`).set({
        ciphertext: 'c',
        iv: 'i',
        serverUpdatedAt: ts(),
        rev: 1,
        updatedAt: 1,
        conflictOf: E1,
      }),
    );
  });

  it('未登入一律拒絕', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc('users/alice').get());
  });

  // ---- #5 欄位型別 / 長度驗證 ----

  it('拒絕超大 ciphertext（儲存耗盡）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(
      db.doc(`users/alice/entries/${E3}`).set({
        ciphertext: 'x'.repeat(262_145), // > 256 KiB
        iv: 'i',
        serverUpdatedAt: ts(),
        rev: 1,
        updatedAt: 1,
      }),
    );
  });

  it('拒絕非正整數 rev', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(
      db.doc(`users/alice/entries/${E3}`).set({
        ciphertext: 'c',
        iv: 'i',
        serverUpdatedAt: ts(),
        rev: 0,
        updatedAt: 1,
      }),
    );
    await assertFails(
      db.doc(`users/alice/entries/${E3}`).set({
        ciphertext: 'c',
        iv: 'i',
        serverUpdatedAt: ts(),
        rev: -5,
        updatedAt: 1,
      }),
    );
  });

  it('拒絕缺少必要欄位的 meta（wrappedVK_byRK）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    await assertFails(
      db.doc('users/alice').set({
        kdfParams: { algo: 'argon2id', salt: 'x' },
        vaultRev: 1,
        updatedAt: 1,
      }),
    );
  });

  // ---- #6 vaultRev 單調不遞減 ----

  it('允許 vaultRev 持平或遞增，拒絕回滾', async () => {
    const db = testEnv.authenticatedContext('carol').firestore();
    const ref = db.doc('users/carol');
    const meta = (rev: number) => ({
      kdfParams: { algo: 'argon2id', salt: 'x' },
      wrappedVK_byRK: { ct: 'a', iv: 'b' },
      vaultRev: rev,
      updatedAt: rev,
    });
    await assertSucceeds(ref.set(meta(5)));
    await assertSucceeds(ref.set(meta(5))); // 持平（重複推送）
    await assertSucceeds(ref.set(meta(6))); // 遞增
    await assertFails(ref.set(meta(3))); // 回滾 → 拒絕
  });

  // ---- #7 條目 rev 單調不遞減（防併發同步的 lost update）----

  it('條目 rev 可持平或遞增，拒絕以較舊 rev 覆蓋', async () => {
    const db = testEnv.authenticatedContext('dave').firestore();
    const ref = db.doc(`users/dave/entries/${E1}`);
    const entry = (rev: number) => ({
      ciphertext: 'c',
      iv: 'i',
      rev,
      updatedAt: rev,
      serverUpdatedAt: ts(),
    });
    await assertSucceeds(ref.set(entry(5)));
    await assertSucceeds(ref.set(entry(5))); // 重送
    await assertSucceeds(ref.set(entry(6)));
    await assertFails(ref.set(entry(4))); // 基於舊版的推送 → 拒絕
    // 墓碑（空密文）照樣需遞增 rev
    await assertSucceeds(ref.set({ ciphertext: '', iv: '', rev: 7, updatedAt: 7, serverUpdatedAt: ts(), deleted: true }));
    await assertSucceeds(ref.delete()); // 墓碑 GC
  });

  it('拒絕非 UUID 的條目 id 與 conflictOf', async () => {
    const db = testEnv.authenticatedContext('alice').firestore();
    const entry = { ciphertext: 'c', iv: 'i', rev: 1, updatedAt: 1, serverUpdatedAt: ts() };
    await assertFails(db.doc('users/alice/entries/not-a-uuid').set(entry));
    await assertFails(
      db.doc(`users/alice/entries/${E2}`).set({ ...entry, conflictOf: 'x'.repeat(5000) }),
    );
  });

  it('拒絕非 map 的 wrappedVK_byMEK', async () => {
    const db = testEnv.authenticatedContext('erin').firestore();
    await assertFails(
      db.doc('users/erin').set({
        kdfParams: { algo: 'argon2id', salt: 'x' },
        wrappedVK_byMEK: 'garbage',
        wrappedVK_byRK: { ct: 'a', iv: 'b' },
        vaultRev: 1,
        updatedAt: 1,
      }),
    );
  });

  it('不允許刪除 meta 文件', async () => {
    const db = testEnv.authenticatedContext('carol').firestore();
    await assertFails(db.doc('users/carol').delete());
  });

  // ---- #8 serverUpdatedAt / updatedAt 時間驗證 ----

  it('條目必須帶伺服器時間戳，不接受缺少或客戶端自填', async () => {
    const db = testEnv.authenticatedContext('frank').firestore();
    const ref = db.doc(`users/frank/entries/${E1}`);
    const base = { ciphertext: 'c', iv: 'i', rev: 1, updatedAt: 1 };
    await assertFails(ref.set(base)); // 舊版客戶端（無時間戳）
    await assertFails(ref.set({ ...base, serverUpdatedAt: new Date(0) }));
    await assertSucceeds(ref.set({ ...base, serverUpdatedAt: ts() }));
  });

  it('拒絕遠在未來的 updatedAt（條目與 meta）', async () => {
    const db = testEnv.authenticatedContext('grace').firestore();
    const future = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const soon = Date.now() + 60 * 60 * 1000; // 一小時的時鐘誤差可接受
    const entry = (updatedAt: number) => ({
      ciphertext: 'c',
      iv: 'i',
      rev: 1,
      updatedAt,
      serverUpdatedAt: ts(),
    });
    await assertFails(db.doc(`users/grace/entries/${E1}`).set(entry(future)));
    await assertSucceeds(db.doc(`users/grace/entries/${E2}`).set(entry(soon)));
    const meta = (updatedAt: number) => ({
      kdfParams: { algo: 'argon2id', salt: 'x' },
      wrappedVK_byRK: { ct: 'a', iv: 'b' },
      vaultRev: 1,
      updatedAt,
    });
    await assertFails(db.doc('users/grace').set(meta(future)));
    await assertSucceeds(db.doc('users/grace').set(meta(soon)));
  });
});
