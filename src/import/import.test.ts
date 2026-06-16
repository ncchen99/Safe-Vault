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
    const entry = candidateToEntry(c)!;
    expect(entry.service).toBe('GitHub');
    expect(entry.credentials).toHaveLength(1);
    expect(entry.credentials[0].password).toBe('C0de-rev1ew!');
    expect(entry.id).toBeTruthy();
  });

  it('併入既有條目：完全相同帳密 → 回傳 null（不複製）', () => {
    const existing: ServiceEntry[] = [
      {
        id: 'e1',
        service: 'Facebook',
        aliases: ['臉書'],
        tags: [],
        credentials: [{ id: 'c1', username: 'a@b.com', password: 'Reuse-pw-123!' }],
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const [c] = parseImport(['臉書', 'a@b.com', 'Reuse-pw-123!'].join('\n'), existing);
    expect(c.duplicateId).toBe('e1');
    expect(candidateToEntry(c, existing[0])).toBeNull();
  });

  it('併入既有條目：不同帳號 → 沿用既有 id、附加為另一組憑證', () => {
    const existing: ServiceEntry[] = [
      {
        id: 'e1',
        service: '104人力',
        aliases: [],
        tags: [],
        credentials: [{ id: 'c1', username: 'first@x.com', password: 'pw-one-11!' }],
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const [c] = parseImport(['104人力', 'second@x.com', 'pw-two-22!'].join('\n'), existing);
    const merged = candidateToEntry(c, existing[0])!;
    expect(merged.id).toBe('e1'); // 沿用既有 id → 同步不會變兩份
    expect(merged.credentials).toHaveLength(2);
    expect(merged.credentials[1].username).toBe('second@x.com');
  });
});

describe('彈性自訂欄位解析（真實雜亂資料）', () => {
  it('跨行標籤配對：標籤獨佔一行、值在下一行', () => {
    const text = [
      '台新證券',
      '密碼',
      'Gfu4394Xk',
      '電話下單密碼',
      '5493288',
      '卡片密碼',
      '3668263',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.password).toBe('Gfu4394Xk');
    const f = c.fields.fields ?? [];
    const phoneOrder = f.find((x) => x.label === '電話下單密碼');
    expect(phoneOrder?.value).toBe('5493288');
    expect(phoneOrder?.secret).toBe(true); // 含「密碼」→ 預設遮蔽
    expect(f.find((x) => x.label === '卡片密碼')?.value).toBe('3668263');
  });

  it('電話另存為「電話」欄位，標籤＋空白＋值（理財密碼）', () => {
    const text = ['Richart', 'nc@gmail.com', '0994394305', '理財密碼 14242'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.username).toBe('nc@gmail.com');
    const f = c.fields.fields ?? [];
    expect(f.find((x) => x.label === '電話')?.value).toBe('0994394305');
    const wealth = f.find((x) => x.label === '理財密碼');
    expect(wealth?.value).toBe('14242');
    expect(wealth?.secret).toBe(true);
  });

  it('冒號分隔的未知標籤 → 自訂欄位', () => {
    const text = ['LINE商家', 'bussniss ID: Tuckin', 'aZq6@jerfNQaMZWv'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.fields?.find((x) => x.label === 'bussniss ID')?.value).toBe('Tuckin');
    expect(c.fields.password).toBe('aZq6@jerfNQaMZWv');
  });

  it('candidateToEntry 映射自訂欄位並正規化服務名（FB → Facebook）', () => {
    const [c] = parseImport(['FB', 'me@x.com', 'Passw0rd-9xy', '理財密碼 1234'].join('\n'));
    const entry = candidateToEntry(c)!;
    expect(entry.service).toBe('Facebook');
    expect(entry.aliases).toContain('FB');
    expect(entry.credentials[0].fields?.some((x) => x.label === '理財密碼' && x.value === '1234')).toBe(true);
  });
});

describe('記事本雜亂格式（acc/pwd、末尾冒號、跨行、多組帳密）', () => {
  it('acc/pwd 縮寫標籤歸位到帳號/密碼', () => {
    const text = ['twitch', 'acc: brtb4343rf', 'pwd: erbverb@@bre@'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('twitch');
    expect(c.fields.username).toBe('brtb4343rf');
    expect(c.fields.password).toBe('erbverb@@bre@');
  });

  it('PWD: 標籤獨佔一行、值在下一行（末尾冒號）', () => {
    const text = ['Jandi', 'Account: nergojfg@gmail.com', 'PWD:', 'rgergerg43'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.username).toBe('nergojfg@gmail.com');
    expect(c.fields.password).toBe('rgergerg43');
  });

  it('服務名末尾全形冒號被去除（windscribe：）', () => {
    const text = ['windscribe：', 'acc: reregreg', 'pwd: ergre'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('windscribe');
  });

  it('第一行含冒號且非已知標籤 → 整行留作服務名（valine : leanCloud）', () => {
    const text = ['valine : leanCloud', 'acc: greger44@gmail.com', 'pwd: Aergrerg'].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toContain('valine');
    expect(c.fields.service).toContain('leanCloud');
    expect(c.fields.username).toBe('greger44@gmail.com');
    expect(c.fields.password).toBe('Aergrerg');
    // 不應誤建成自訂欄位
    expect(c.fields.fields?.some((x) => x.label === 'valine')).toBeFalsy();
  });

  it('同服務多組 acc/pwd → 拆成多筆，共用服務名', () => {
    const text = [
      'protonVPn',
      'acc: eihrreibnvbire',
      'pwd: fgrgrr',
      'acc: efrgregw3',
      'pwd: regergerg',
    ].join('\n');
    const cands = parseImport(text);
    expect(cands).toHaveLength(2);
    expect(cands[0].fields.service).toBe('protonVPn');
    expect(cands[1].fields.service).toBe('protonVPn');
    expect(cands[0].fields.username).toBe('eihrreibnvbire');
    expect(cands[0].fields.password).toBe('fgrgrr');
    expect(cands[1].fields.username).toBe('efrgregw3');
    expect(cands[1].fields.password).toBe('regergerg');
  });

  it('三組帳密一樣逐組拆分（windscribe）', () => {
    const text = [
      'windscribe：',
      'acc: reregreg',
      'pwd: ergre',
      'acc: gre',
      'pwd: ergergre',
      'acc: ergrg43434',
      'pwd: 4gerber',
    ].join('\n');
    const cands = parseImport(text);
    expect(cands).toHaveLength(3);
    expect(cands.every((c) => c.fields.service === 'windscribe')).toBe(true);
    expect(cands[2].fields.username).toBe('ergrg43434');
    expect(cands[2].fields.password).toBe('4gerber');
  });

  it('無標籤的 email↵密碼 區塊不誤拆', () => {
    const text = ['Fb黏誠', 'bverbr@slowimo.com', 'brgw34vr'].join('\n');
    const cands = parseImport(text);
    expect(cands).toHaveLength(1);
    expect(cands[0].fields.username).toBe('bverbr@slowimo.com');
    expect(cands[0].fields.password).toBe('brgw34vr');
  });
});

describe('純位置序列與弱密碼（服務名↵ID↵密碼）', () => {
  it('Puma：電話作帳號、弱密碼也能補上', () => {
    const [c] = parseImport(['Puma', '093243330', 'wefewefefew'].join('\n'));
    expect(c.fields.service).toBe('Puma');
    expect(c.fields.username).toBe('093243330');
    expect(c.fields.password).toBe('wefewefefew');
  });

  it('1111 人力銀行：身分證字號作帳號、弱密碼作密碼', () => {
    const [c] = parseImport(['1111 人力銀行', 'B1323432', 'fbgfbgfbg'].join('\n'));
    expect(c.fields.service).toBe('1111 人力銀行');
    expect(c.fields.username).toBe('B1323432');
    expect(c.fields.password).toBe('fbgfbgfbg');
  });

  it('iCash：服務名↵ID↵數字密碼', () => {
    const [c] = parseImport(['I cash (line)', 'gfdgg344', '343433'].join('\n'));
    expect(c.fields.service).toBe('I cash (line)');
    expect(c.fields.username).toBe('gfdgg344');
    expect(c.fields.password).toBe('343433');
  });

  it('中文標籤緊貼值、無分隔符（代號f73244365 / 密碼3245tfh69）', () => {
    const text = [
      '永豐帳號',
      'nccefw9@gmail.com',
      '090643240',
      '代號f73244365',
      '密碼3245tfh69',
      '理財密碼 2953',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('永豐帳號');
    expect(c.fields.username).toBe('nccefw9@gmail.com');
    expect(c.fields.password).toBe('3245tfh69');
    const f = c.fields.fields ?? [];
    expect(f.find((x) => x.label === '代號')?.value).toBe('f73244365');
    expect(f.find((x) => x.label === '理財密碼')?.value).toBe('2953');
    expect(f.find((x) => x.label === '電話')?.value).toBe('090643240');
  });

  it('片語標籤的清單值收集（Recovery code 多行）', () => {
    const text = [
      'Gitlab',
      'nc9ewfew9@gmail.com',
      'f;8$-wefewf.+K7T7W',
      'Recovery code:',
      'd33c0ec28684669a',
      'a282ee02d9df9c3a',
      '1a2741b1c1a4d1ca',
    ].join('\n');
    const [c] = parseImport(text);
    expect(c.fields.service).toBe('Gitlab');
    expect(c.fields.username).toBe('nc9ewfew9@gmail.com');
    expect(c.fields.password).toBe('f;8$-wefewf.+K7T7W');
    const rec = (c.fields.fields ?? []).find((x) => /recovery/i.test(x.label));
    expect(rec?.value.split('\n')).toHaveLength(3);
    expect(rec?.secret).toBe(true);
  });

  it('FB 後綴使用者標記移入備註，服務名只留 Facebook', () => {
    const [c] = parseImport(['Fb黏誠', 'bverbr@slowimo.com', 'brgw34vr'].join('\n'));
    const entry = candidateToEntry(c)!;
    expect(entry.service).toBe('Facebook');
    expect(entry.credentials[0].note).toContain('黏誠');
  });
});
