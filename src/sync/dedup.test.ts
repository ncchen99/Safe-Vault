import { describe, it, expect } from 'vitest';
import { sameContent, findDuplicateCopyIds, type DedupCandidate } from './dedup';
import type { ServiceEntry } from '@/types/entry';

function entry(p: Partial<ServiceEntry> & { id: string }): ServiceEntry {
  return {
    service: 'GitHub',
    aliases: ['github'],
    tags: ['dev'],
    credentials: [{ id: 'c1', username: 'a@b.com', password: 'pw' }],
    createdAt: 1000,
    updatedAt: 1000,
    ...p,
  };
}

describe('sameContent', () => {
  it('忽略 id / 時間戳 / 別名差異 → 視為相同', () => {
    const a = entry({ id: 'x', createdAt: 1, updatedAt: 2, aliases: ['x'] });
    const b = entry({ id: 'y', createdAt: 9, updatedAt: 9, aliases: ['y'] });
    expect(sameContent(a, b)).toBe(true);
  });

  it('密碼不同 → 視為不同', () => {
    const a = entry({ id: 'x' });
    const b = entry({
      id: 'y',
      credentials: [{ id: 'c1', username: 'a@b.com', password: 'DIFFERENT' }],
    });
    expect(sameContent(a, b)).toBe(false);
  });
});

describe('findDuplicateCopyIds', () => {
  it('內容相同的 conflictOf 副本 → 標記刪除', () => {
    const cands: DedupCandidate[] = [
      { id: 'orig', content: entry({ id: 'orig' }) },
      { id: 'copy', conflictOf: 'orig', content: entry({ id: 'copy' }) },
    ];
    expect(findDuplicateCopyIds(cands)).toEqual(['copy']);
  });

  it('真正的衝突副本（內容已不同）→ 保留', () => {
    const cands: DedupCandidate[] = [
      { id: 'orig', content: entry({ id: 'orig' }) },
      {
        id: 'copy',
        conflictOf: 'orig',
        content: entry({
          id: 'copy',
          credentials: [{ id: 'c1', username: 'a@b.com', password: 'edited' }],
        }),
      },
    ];
    expect(findDuplicateCopyIds(cands)).toEqual([]);
  });

  it('原條目不存在（已刪）→ 保守保留副本', () => {
    const cands: DedupCandidate[] = [
      { id: 'copy', conflictOf: 'gone', content: entry({ id: 'copy' }) },
    ];
    expect(findDuplicateCopyIds(cands)).toEqual([]);
  });

  it('一原多副本（多裝置都中過 bug）→ 全部副本刪除、保留原條目', () => {
    const cands: DedupCandidate[] = [
      { id: 'orig', content: entry({ id: 'orig' }) },
      { id: 'c1', conflictOf: 'orig', content: entry({ id: 'c1' }) },
      { id: 'c2', conflictOf: 'orig', content: entry({ id: 'c2' }) },
    ];
    expect(findDuplicateCopyIds(cands).sort()).toEqual(['c1', 'c2']);
  });
});
