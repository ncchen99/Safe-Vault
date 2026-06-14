/**
 * 有限狀態機式的單區塊解析：把一個區塊的行序列轉成候選欄位 + 各欄位信心。
 * 規則導向、可解釋（每個決定都記 reason）。純本機。
 */
import type { FieldKey, ImportFields } from '@/types/import';
import { splitLabeled, toLines } from './canonicalize';
import { labelToField } from './labels';
import { domainStem } from '@/search/normalize';
import {
  isBareTotpSecret,
  isEmail,
  isOtpAuth,
  isPhone,
  isUrl,
  passwordLikeness,
} from './tokens';

export interface ParsedBlock {
  fields: ImportFields;
  confidence: Partial<Record<FieldKey, number>>;
  reasons: Partial<Record<FieldKey, string>>;
}

export function parseBlock(block: string): ParsedBlock {
  const lines = toLines(block);
  const fields: ImportFields = {};
  const confidence: Partial<Record<FieldKey, number>> = {};
  const reasons: Partial<Record<FieldKey, string>> = {};
  const noteParts: string[] = [];

  const set = (key: FieldKey, value: string, conf: number, why: string) => {
    if (fields[key] !== undefined) return; // 先到先得（labeled 行通常在前）
    fields[key] = value;
    confidence[key] = conf;
    reasons[key] = why;
  };

  const parsed = lines.map((line) => {
    const { label, value } = splitLabeled(line);
    const field = label ? labelToField(label) : undefined;
    return { line, label, value, field };
  });

  // 第一遍：先處理所有「有標籤且字典命中」的行（最高信心、不受順序干擾）
  for (const p of parsed) {
    if (p.field) assignLabeled(p.field, p.value, set);
  }

  // 第二遍：其餘行依內容型態判斷
  for (const p of parsed) {
    if (p.field) continue;
    // 標籤未命中字典時，仍用其 value 作內容；純無標籤則用整行
    const v = (p.label ? p.value : p.line).trim();
    if (isOtpAuth(v)) {
      set('otp', v, 0.95, 'otpauth:// URI');
    } else if (isUrl(v)) {
      set('url', normalizeUrl(v), 0.8, '看起來是網址');
    } else if (isEmail(v)) {
      set('username', v, 0.72, 'email 格式');
    } else if (isBareTotpSecret(v)) {
      set('otp', v.replace(/\s/g, '').toUpperCase(), 0.6, 'base32 TOTP 種子');
    } else if (isPhone(v)) {
      noteParts.push(v);
    } else {
      const pw = passwordLikeness(v);
      if (pw.score >= 0.5 && fields.password === undefined) {
        set('password', v, Math.min(0.85, 0.4 + pw.score * 0.5), pw.reasons.join('、'));
      } else if (fields.service === undefined && isServiceLike(v)) {
        set('service', v, 0.6, '首個非結構化短行，推測為服務名稱');
      } else {
        noteParts.push(v);
      }
    }
  }

  // 3) 補強：service 缺失 → 由網域推導
  if (fields.service === undefined && fields.url) {
    const stem = domainStem(fields.url);
    if (stem) {
      const titled = stem.charAt(0).toUpperCase() + stem.slice(1);
      set('service', titled, 0.5, '由網址網域推導');
    }
  }

  if (noteParts.length) {
    set('note', noteParts.join('\n'), 0.5, '未能歸類的剩餘文字');
  }

  return { fields, confidence, reasons };
}

/** 有標籤行：信任標籤，但用內容驗證並調整信心。 */
function assignLabeled(
  field: FieldKey,
  value: string,
  set: (k: FieldKey, v: string, c: number, w: string) => void,
) {
  switch (field) {
    case 'url':
      set('url', normalizeUrl(value), 0.92, '標籤指明網址');
      break;
    case 'otp':
      set('otp', isOtpAuth(value) ? value : value.replace(/\s/g, '').toUpperCase(), 0.9, '標籤指明 OTP');
      break;
    case 'password':
      set('password', value, 0.9, '標籤指明密碼');
      break;
    case 'username':
      set('username', value, isEmail(value) ? 0.95 : 0.88, '標籤指明帳號');
      break;
    case 'service':
      set('service', value, 0.9, '標籤指明服務名稱');
      break;
    case 'note':
      set('note', value, 0.85, '標籤指明備註');
      break;
  }
}

function normalizeUrl(v: string): string {
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** 服務名稱的弱啟發：不太長、不含明顯密碼符號雜訊。 */
function isServiceLike(v: string): boolean {
  if (v.length > 40) return false;
  // 純亂碼（高比例符號）不像服務名
  const symbolRatio = (v.match(/[^\w一-鿿\s.-]/g)?.length ?? 0) / v.length;
  return symbolRatio < 0.3;
}
