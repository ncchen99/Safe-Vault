import { describe, it, expect } from 'vitest';
import { mergeEntries, mergeMeta } from './merge';
import type { EncryptedEntry } from '@/types/entry';

let counter = 0;
const newId = () => `conflict-${++counter}`;

function enc(p: Partial<EncryptedEntry> & { id: string }): EncryptedEntry {
  return {
    ciphertext: 'ct',
    iv: 'iv',
    rev: 1,
    updatedAt: 1000,
    ...p,
  };
}

describe('mergeEntries', () => {
  it('只在本機的條目 → 上傳並保留', () => {
    const r = mergeEntries([enc({ id: 'a', rev: 2, baseRev: 1 })], [], newId);
    expect(r.toPush.map((e) => e.id)).toEqual(['a']);
    expect(r.resolved).toHaveLength(1);
    expect(r.resolved[0].baseRev).toBe(2);
    expect(r.conflicts).toHaveLength(0);
  });

  it('只在遠端的條目 → 下載採用、不推送', () => {
    const r = mergeEntries([], [enc({ id: 'b', rev: 5 })], newId);
    expect(r.toPush).toHaveLength(0);
    expect(r.resolved[0]).toMatchObject({ id: 'b', rev: 5, baseRev: 5 });
  });

  it('雙方都未變更（rev === baseRev）→ 無動作', () => {
    const r = mergeEntries(
      [enc({ id: 'c', rev: 3, baseRev: 3 })],
      [enc({ id: 'c', rev: 3 })],
      newId,
    );
    expect(r.toPush).toHaveLength(0);
    expect(r.conflicts).toHaveLength(0);
    expect(r.resolved[0].rev).toBe(3);
  });

  it('只有遠端較新 → 下載覆蓋本機', () => {
    const r = mergeEntries(
      [enc({ id: 'd', rev: 2, baseRev: 2, ciphertext: 'old' })],
      [enc({ id: 'd', rev: 5, ciphertext: 'new' })],
      newId,
    );
    expect(r.toPush).toHaveLength(0);
    expect(r.resolved[0]).toMatchObject({ ciphertext: 'new', baseRev: 5 });
  });

  it('只有本機較新 → 推送', () => {
    const r = mergeEntries(
      [enc({ id: 'e', rev: 4, baseRev: 2 })],
      [enc({ id: 'e', rev: 2 })],
      newId,
    );
    expect(r.toPush.map((e) => e.id)).toEqual(['e']);
  });

  it('雙方併發修改 → 衝突：勝者保留原 id、敗者成為 conflictOf 副本', () => {
    counter = 0;
    const r = mergeEntries(
      [enc({ id: 'f', rev: 3, baseRev: 2, updatedAt: 2000, ciphertext: 'L' })],
      [enc({ id: 'f', rev: 3, updatedAt: 3000, ciphertext: 'R' })],
      newId,
    );
    // 遠端 updatedAt 較新 → 勝
    const winner = r.resolved.find((e) => e.id === 'f')!;
    expect(winner.ciphertext).toBe('R');
    expect(winner.rev).toBe(4); // max(3,3)+1
    const loser = r.conflicts[0];
    expect(loser).toMatchObject({ conflictOf: 'f', ciphertext: 'L', rev: 1 });
    expect(r.toPush.map((e) => e.id).sort()).toEqual(['conflict-1', 'f']);
  });

  it('本機刪除（墓碑）且遠端未變更 → 推送墓碑，遠端據此刪除', () => {
    const r = mergeEntries(
      [enc({ id: 'g', rev: 3, baseRev: 2, deleted: true, ciphertext: '', iv: '' })],
      [enc({ id: 'g', rev: 2, ciphertext: 'live' })],
      newId,
    );
    const pushed = r.toPush.find((e) => e.id === 'g')!;
    expect(pushed.deleted).toBe(true);
    expect(r.resolved.find((e) => e.id === 'g')!.deleted).toBe(true);
  });

  it('遠端刪除（墓碑）且本機未變更 → 本機採用墓碑（條目消失）', () => {
    const r = mergeEntries(
      [enc({ id: 'h', rev: 2, baseRev: 2, ciphertext: 'live' })],
      [enc({ id: 'h', rev: 4, deleted: true, ciphertext: '', iv: '' })],
      newId,
    );
    expect(r.toPush).toHaveLength(0);
    expect(r.resolved[0]).toMatchObject({ id: 'h', deleted: true });
  });

  it('一方刪除、另一方併發編輯 → 衝突保留編輯內容，不靜默遺失', () => {
    counter = 0;
    const r = mergeEntries(
      // 本機刪除（較舊）
      [enc({ id: 'k', rev: 3, baseRev: 2, updatedAt: 2000, deleted: true, ciphertext: '', iv: '' })],
      // 遠端編輯（較新）→ 勝
      [enc({ id: 'k', rev: 3, updatedAt: 3000, ciphertext: 'EDIT' })],
      newId,
    );
    const winner = r.resolved.find((e) => e.id === 'k')!;
    expect(winner.ciphertext).toBe('EDIT');
    expect(winner.deleted).toBeFalsy();
  });
});

describe('mergeMeta', () => {
  const base = { vaultRev: 1, updatedAt: 1000 };
  it('遠端不存在 → 推送本機', () => {
    expect(mergeMeta(base, null)).toEqual({ meta: base, pushLocal: true });
  });
  it('本機 vaultRev 較大 → 推送本機', () => {
    const r = mergeMeta({ vaultRev: 3, updatedAt: 1 }, { vaultRev: 2, updatedAt: 9 });
    expect(r.pushLocal).toBe(true);
    expect(r.meta.vaultRev).toBe(3);
  });
  it('遠端 vaultRev 較大 → 採用遠端', () => {
    const r = mergeMeta({ vaultRev: 2, updatedAt: 9 }, { vaultRev: 5, updatedAt: 1 });
    expect(r.pushLocal).toBe(false);
    expect(r.meta.vaultRev).toBe(5);
  });
});
