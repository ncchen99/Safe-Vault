/**
 * 服務 → icon 比對（全程本機、零網路）。
 *
 * 三層策略，依序嘗試：
 *  1) 品牌 icon：以服務名／別名／網域比對 simple-icons 精選集（brands.generated）。
 *  2) 分類字形：以關鍵字（含台灣在地服務）推測類別 → 通用字形。
 *  3) 分類字形（語意）：沿用既有概念字典（網銀≈banking）自動歸類。
 * 全部失敗 → 由元件以「服務名前兩字」字母頭貼收尾。
 *
 * 隱私：絕不向遠端抓 favicon —— 那會把使用者的服務清單外洩給第三方。
 */
import type { ServiceEntry } from '@/types/entry';
import { normalize } from '@/search/normalize';
import { conceptsOfAll } from '@/search/semantic';
import { BRAND_ICONS } from './brands.generated';
import { CUSTOM_BRAND_ICONS } from './brands.custom';

// generated（simple-icons）＋ custom（手工補的大廠）合併為單一 registry。
// custom 放後面，可在需要時覆蓋同名 slug。
const BY_SLUG = new Map(
  [...BRAND_ICONS, ...CUSTOM_BRAND_ICONS].map((b) => [b.slug, b]),
);

/** 取 ascii 精簡鍵（CJK 會被清空，由 ALIAS 處理）。 */
function asciiKey(s: string): string {
  return normalize(s).replace(/[^a-z0-9]/g, '');
}

/** 正規化鍵（保留 CJK，供中文別名比對）。 */
function nkey(s: string): string {
  return normalize(s).trim();
}

/**
 * 在地化／縮寫／網域別名 → simple-icons slug。
 * 只放「光靠服務名 ascii 化對不上」的：中文名、縮寫、網域與 slug 不一致者。
 */
const ALIAS: Record<string, string> = {
  // 社群 / 通訊
  臉書: 'facebook', fb: 'facebook', 油管: 'youtube', ig: 'instagram',
  インスタ: 'instagram', 推特: 'x', twitter: 'x', 賴: 'line', 微信: 'wechat',
  谷歌: 'google', 電報: 'telegram', 訊號: 'signal',
  // 購物 / 支付（網域或中文）
  蝦皮: 'shopee', 淘寶: 'aliexpress', 全球速賣通: 'aliexpress',
  // 旅遊：網域與 slug 不一致
  booking: 'bookingdotcom', 'booking.com': 'bookingdotcom',
  trip: 'tripdotcom', 'trip.com': 'tripdotcom',
  // 開發 / 雲端
  gh: 'github',
  // 大廠（simple-icons 已移除，由 brands.custom 補 icon）
  奧多比: 'adobe', photoshop: 'adobe', lightroom: 'adobe', illustrator: 'adobe',
  acrobat: 'adobe', 'creative cloud': 'adobe', creativecloud: 'adobe',
  adobecc: 'adobe', premiere: 'adobe',
  微軟: 'microsoft', ms: 'microsoft', office: 'microsoft', office365: 'microsoft',
  microsoft365: 'microsoft', onedrive: 'microsoft', onenote: 'microsoft',
  teams: 'microsoft', 'microsoft teams': 'microsoft',
  領英: 'linkedin',
  // 讓正規化後的群組名稱仍能對回品牌 icon
  appleid: 'apple', 蘋果: 'apple', 'apple id': 'apple',
};

/**
 * 帳號身分群組：多個品牌/服務共用「同一組帳密」→ 統一服務名。
 * 例：Gmail / Google Drive / Google Photos 都是同一個 Google 帳號。
 * Instagram 刻意不併入 Facebook（許多人帳密不同）。
 */
const ACCOUNT_GROUPS: { name: string; slugs: string[] }[] = [
  {
    name: 'Google 帳號',
    slugs: [
      'google', 'gmail', 'googledrive', 'googlephotos', 'googlecalendar',
      'googlemaps', 'googlepay', 'googlechrome', 'youtube',
    ],
  },
  { name: 'Apple ID', slugs: ['apple', 'appstore', 'applemusic', 'icloud'] },
  { name: 'Facebook', slugs: ['facebook', 'messenger'] },
];

const SLUG_TO_GROUP = new Map<string, string>();
for (const g of ACCOUNT_GROUPS) for (const s of g.slugs) SLUG_TO_GROUP.set(s, g.name);

/** 從 URL 取主網域標籤，例如 https://www.facebook.com/x → 'facebook'。 */
function domainLabel(url?: string): string | null {
  if (!url) return null;
  let host = url.trim();
  try {
    host = new URL(url.includes('://') ? url : `https://${url}`).hostname;
  } catch {
    host = url.replace(/^[a-z]+:\/\//i, '').split('/')[0];
  }
  host = host.replace(/^www\./i, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  // 取第二層標籤（a.b.com → 'b'；facebook.com → 'facebook'）
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

/** CJK（非 ascii）別名鍵——這些品牌名夠獨特，允許子字串比對（如「蝦皮購物」）。 */
const CJK_ALIAS: [string, string][] = Object.entries(ALIAS).filter(([k]) =>
  /[^\x00-\x7f]/.test(k),
);

/** 比對品牌 slug；找不到回傳 null。 */
export function matchBrandSlug(entry: ServiceEntry): string | null {
  const raws: string[] = [entry.service, ...(entry.aliases ?? [])];
  const label = domainLabel(entry.url);
  if (label) raws.push(label);

  // 第一輪：精確比對（別名表 / ascii 等於 slug）
  for (const raw of raws) {
    if (!raw) continue;
    const aliasHit = ALIAS[nkey(raw)] ?? ALIAS[asciiKey(raw)];
    if (aliasHit && BY_SLUG.has(aliasHit)) return aliasHit;
    const ak = asciiKey(raw);
    if (ak && BY_SLUG.has(ak)) return ak;
  }
  // 第二輪：CJK 別名子字串（「蝦皮購物」→ shopee）
  for (const raw of raws) {
    const nk = nkey(raw);
    if (!nk) continue;
    for (const [key, slug] of CJK_ALIAS) {
      if (nk.includes(key) && BY_SLUG.has(slug)) return slug;
    }
  }
  return null;
}

/**
 * 台灣在地（英文短名）銀行／服務 → 概念類別。
 * 中文行名（含「銀行」「網銀」）已由概念字典自動歸 banking，這裡補英文短名。
 */
const LOCAL_CONCEPT: { concept: string; terms: string[] }[] = [
  {
    concept: 'banking',
    terms: [
      'ctbc', 'cathay', 'esun', 'e.sun', 'fubon', 'taishin', 'mega',
      'sinopac', 'firstbank', 'huanan', 'taiwanbank', 'landbank', 'tcb',
      'chb', 'scsb', 'ubot', 'obank', 'nextbank', 'linebank', 'jko',
      '街口', '悠遊付', '玉山', '國泰', '中信', '兆豐', '永豐', '台新',
      '富邦', '彰銀', '第一銀', '土銀', '郵局', '郵政',
    ],
  },
  {
    concept: 'shopping',
    terms: ['momo', 'pchome', '露天', '東森購物', 'books', '博客來', '全聯', 'pxmart'],
  },
  {
    concept: 'work',
    terms: ['104', '1111', 'cake', '報稅', '報帳'],
  },
];

/** 以在地關鍵字推測概念類別；找不到回傳 null。 */
function localConcept(entry: ServiceEntry): string | null {
  const hay = [entry.service, ...(entry.aliases ?? []), ...(entry.tags ?? [])]
    .map(nkey)
    .filter(Boolean);
  for (const { concept, terms } of LOCAL_CONCEPT) {
    for (const t of terms) {
      const tk = nkey(t);
      if (hay.some((h) => h.includes(tk))) return concept;
    }
  }
  return null;
}

/** 取條目的分類概念（在地關鍵字優先，再用概念字典）。找不到回傳 null。 */
export function matchConcept(entry: ServiceEntry): string | null {
  const local = localConcept(entry);
  if (local) return local;
  const fields = [entry.service, ...(entry.aliases ?? []), entry.url ?? '', ...(entry.tags ?? [])];
  const concepts = conceptsOfAll(fields.filter(Boolean));
  // 取第一個（Set 迭代序＝插入序，概念字典定義序穩定）
  for (const c of concepts) return c;
  return null;
}

/**
 * 從服務名中抽出「品牌字以外的描述詞」（僅限含中文者）。
 * 例：「Fb黏誠」→「黏誠」、「臉書念誠」→「念誠」、「FB」→ undefined。
 * 用途：把這段「哪一個使用者」的標記移到備註，服務名只留官方品牌。
 */
function brandDescriptor(raw: string, slug: string): string | undefined {
  // 蒐集所有對應到此 slug 的可見字：slug、品牌 title、別名鍵。
  const keys = [slug];
  const brand = BY_SLUG.get(slug);
  if (brand?.title) keys.push(brand.title);
  for (const [k, v] of Object.entries(ALIAS)) if (v === slug) keys.push(k);
  keys.sort((a, b) => b.length - a.length); // 先剝最長者，避免 fb 先吃掉 facebook

  const lower = raw.toLowerCase();
  let rest = raw;
  for (const k of keys) {
    const idx = lower.indexOf(k.toLowerCase());
    if (idx >= 0) {
      rest = raw.slice(0, idx) + raw.slice(idx + k.length);
      break;
    }
  }
  const cleaned = rest.replace(/^[\s:：_．.\-]+|[\s:：_．.\-]+$/g, '').trim();
  // 僅當剩餘含中文時才視為「使用者標記」，避免把網域 TLD（.com）誤當描述詞。
  return cleaned && /[一-鿿]/.test(cleaned) ? cleaned : undefined;
}

/**
 * 服務名稱正規化：FB / 臉書 / facebook.com → 官方品牌名「Facebook」。
 * 重用品牌比對；命中則回官方 title 與 slug，否則 null（保留使用者原輸入）。
 * descriptor：服務名中夾帶的中文使用者標記（如 Fb黏誠 → 黏誠），供呼叫端移入備註。
 */
export function canonicalServiceName(
  input: string,
): { name: string; slug: string; descriptor?: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  const slug = matchBrandSlug({
    id: '',
    service: raw,
    aliases: [],
    tags: [],
    credentials: [],
    createdAt: 0,
    updatedAt: 0,
  });
  if (!slug) return null;
  const descriptor = brandDescriptor(raw, slug);
  // 同帳號群組優先（Gmail → Google 帳號、App Store → Apple ID…）
  const group = SLUG_TO_GROUP.get(slug);
  if (group) return { name: group, slug, descriptor };
  const brand = BY_SLUG.get(slug);
  return brand ? { name: brand.title, slug, descriptor } : null;
}

export { BY_SLUG };
