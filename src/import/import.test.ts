import { describe, expect, it } from 'vitest';
import { parseImport, candidateToEntry } from './pipeline';
import type { ServiceEntry } from '@/types/entry';

describe('智慧匯入管線', () => {
  it('解析單筆 label:value 格式', () => {
    const text = [
      'Facebook',
      '帳號: me@example.com',
      '密碼: Sup3rS3cret!99',
      'https://facebook.com',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('Facebook');
    expect(c.fields.username).toBe('me@example.com');
    expect(c.fields.password).toBe('Sup3rS3cret!99');
    expect(c.fields.url).toBe('https://facebook.com');
    expect(c.needsReview).toBe(false);
  });

  it('空行分隔 → 多筆候選', () => {
    const text = [
      'Gmail',
      'user: alice@gmail.com',
      'pass: hunter2Goose!',
      '',
      'GitHub',
      'username: octocat',
      'password: P@ssw0rd-xyz',
    ].join('\n');
    const cands = parseImport(text);
    expect(cands).toHaveLength(2);
    expect(cands[0].fields.service).toBe('Gmail');
    expect(cands[1].fields.service).toBe('GitHub');
    expect(cands[1].fields.username).toBe('octocat');
  });

  it('分隔線 --- 切分多筆', () => {
    const text = [
      'Netflix / netflix.com',
      'kid@home.tv',
      'Watch!ng2024',
      '---',
      'Spotify',
      'me@home.tv',
      'Mus1c-stream$',
    ].join('\n');
    const cands = parseImport(text);
    expect(cands.length).toBe(2);
    expect(cands[0].fields.service?.toLowerCase()).toContain('netflix');
  });

  it('英文標籤與無標籤 email/url 自動歸位', () => {
    const text = [
      'Twitter',
      'bird@x.com',
      'Tw33t-machine!',
      'x.com',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.username).toBe('bird@x.com');
    expect(c.fields.password).toBe('Tw33t-machine!');
    expect(c.fields.url).toBe('https://x.com');
  });

  it('解析 otpauth:// 為 OTP', () => {
    const text = [
      'AWS',
      'root@corp.com',
      'L0ng-Random-Pw!!',
      'otpauth://totp/AWS:root@corp.com?secret=JBSWY3DPEHPK3PXP&issuer=AWS',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.otp).toContain('otpauth://');
  });

  it('缺密碼 → needsReview', () => {
    const text = ['SomeApp', 'user: john'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.password).toBeUndefined();
    expect(c.needsReview).toBe(true);
  });

  it('由網域推導 service 名稱', () => {
    const text = ['https://dropbox.com', 'me@mail.com', 'Drop-the-b0x!'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('Dropbox');
  });

  it('偵測與既有條目重複', () => {
    const existing: ServiceEntry[] = [
      {
        id: '1',
        service: 'Facebook',
        aliases: ['fb', '臉書'],
        tags: [],
        credentials: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const text = ['臉書', 'a@b.com', 'Reuse-pw-123!'].join('\n');
    const [c] = parseImport(text, existing);
    // service '臉書' 命中既有別名
    expect(c.duplicateOf).toBe('Facebook');
    expect(c.needsReview).toBe(true);
  });

  it('空輸入回傳空陣列', () => {
    expect(parseImport('')).toEqual([]);
    expect(parseImport('   \n\n  ')).toEqual([]);
  });

  it('candidateToEntry 產出合法 ServiceEntry', () => {
    const [c] = parseImport(['GitHub', 'octocat', 'C0de-rev1ew!'].join('\n'));
    const entry = candidateToEntry(c);
    expect(entry.service).toBe('GitHub');
    expect(entry.credentials).toHaveLength(1);
    expect(entry.credentials[0].password).toBe('C0de-rev1ew!');
    expect(entry.id).toBeTruthy();
  });
});
