/**
 * 由 simple-icons 產生「精選品牌 icon」的本地檔案。
 *
 * 為什麼用「產生 + 提交」而非執行期相依：
 *  - 只把精選子集打進 bundle（避免整包數 MB）。
 *  - 執行期不依賴 simple-icons，也永不連網——符合零知識/離線最高原則。
 *
 * 重新產生：`npm run gen:brands`（新增/刪 slug 後執行）。
 * simple-icons 為單色單一 path，正好契合本 App 的灰階（以 currentColor 上色）。
 */
import * as si from 'simple-icons';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/icons/brands.generated.ts');

// 精選 slug（皆已驗證存在於目前安裝的 simple-icons）。
// 註：simple-icons 近年因商標因素移除多家大廠 logo（Microsoft / Amazon /
// LinkedIn / Slack / Nintendo / Disney…），故不在此清單；這類由分類字形補位。
// simple-icons 內不存在者會被略過並警告。
const SLUGS = [
  // 社群 / 通訊
  'line', 'facebook', 'messenger', 'instagram', 'threads', 'x', 'whatsapp',
  'telegram', 'signal', 'discord', 'wechat', 'snapchat', 'tiktok', 'reddit',
  'pinterest', 'tumblr', 'mastodon', 'bluesky', 'viber', 'kakaotalk',
  // Google / Apple 生態
  'google', 'gmail', 'googlechrome', 'googledrive', 'googlephotos',
  'googlecalendar', 'googlemaps', 'youtube', 'apple', 'icloud', 'appstore',
  // 影音 / 娛樂
  'netflix', 'spotify', 'applemusic', 'soundcloud', 'twitch', 'bilibili',
  // 遊戲
  'steam', 'epicgames', 'playstation', 'riotgames', 'ea', 'ubisoft', 'roblox',
  // 購物 / 支付
  'shopee', 'ebay', 'aliexpress', 'paypal', 'stripe', 'visa', 'mastercard',
  'americanexpress', 'jcb', 'wise', 'revolut', 'googlepay', 'alipay',
  // 旅遊 / 交通 / 外送
  'airbnb', 'bookingdotcom', 'uber', 'ubereats', 'foodpanda', 'grab', 'lyft',
  'airasia', 'tripdotcom',
  // 開發 / 雲端 / 工作
  'github', 'gitlab', 'bitbucket', 'gitea', 'docker', 'npm', 'nodedotjs',
  'python', 'vercel', 'netlify', 'cloudflare', 'digitalocean', 'firebase',
  'supabase', 'mongodb', 'postgresql', 'mysql', 'redis', 'figma', 'notion',
  'linear', 'jira', 'trello', 'asana', 'confluence', 'jetbrains', 'anthropic',
  'huggingface', 'vimeo', 'dropbox', 'box', 'wordpress', 'medium', 'substack',
  'stackoverflow',
  // 台灣 / 在地相關（存在於 simple-icons 的國際/區域品牌）
  'rakuten', 'hsbc',
];

const all = Object.values(si).filter((x) => x && x.slug && x.path);
const bySlug = new Map(all.map((i) => [i.slug, i]));

const picked = [];
const missing = [];
const seen = new Set();
for (const slug of SLUGS) {
  if (seen.has(slug)) continue;
  seen.add(slug);
  const icon = bySlug.get(slug);
  if (!icon) {
    missing.push(slug);
    continue;
  }
  picked.push({ slug: icon.slug, title: icon.title, hex: icon.hex, path: icon.path });
}

picked.sort((a, b) => a.slug.localeCompare(b.slug));

const header = `/**
 * 自動產生——請勿手動編輯。來源：simple-icons（CC0），由 scripts/gen-brands.mjs 產生。
 * 重新產生：npm run gen:brands
 * 24x24 單一 path；hex 為品牌官方色（無 # 前綴）。共 ${picked.length} 個。
 */
export interface BrandIcon {
  /** simple-icons slug，例如 'facebook' */
  slug: string;
  /** 品牌全名 */
  title: string;
  /** 品牌官方色（6 碼 hex，無 # 前綴），用於彩色頭像 */
  hex: string;
  /** 24x24 viewBox 的單一 path data */
  path: string;
}

export const BRAND_ICONS: BrandIcon[] = ${JSON.stringify(picked, null, 2)};
`;

writeFileSync(OUT, header, 'utf8');
console.log(`✓ 產生 ${picked.length} 個品牌 icon → ${OUT}`);
if (missing.length) {
  console.warn(`⚠ 略過 ${missing.length} 個 simple-icons 不存在的 slug：`, missing.join(', '));
}
