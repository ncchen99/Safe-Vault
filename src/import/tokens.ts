/**
 * 欄位偵測器：純函式，判斷一段文字「像不像」某種欄位。
 * 全部在本機執行，不查外部服務。
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i;
export const PHONE_RE = /^\+?[\d][\d\s().-]{6,}\d$/;
export const OTPAUTH_RE = /^otpauth:\/\//i;
// 裸 TOTP secret：base32，常見 16/32 字元，允許空白分組
export const BASE32_SECRET_RE = /^[A-Z2-7]{16}(\s?[A-Z2-7]{4,})*$/;

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isUrl(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  if (isEmail(t) || isOtpAuth(t)) return false;
  return URL_RE.test(t);
}

export function isPhone(s: string): boolean {
  const t = s.trim();
  return PHONE_RE.test(t) && (t.match(/\d/g)?.length ?? 0) >= 7;
}

export function isOtpAuth(s: string): boolean {
  return OTPAUTH_RE.test(s.trim());
}

export function isBareTotpSecret(s: string): boolean {
  const t = s.trim().toUpperCase();
  return BASE32_SECRET_RE.test(t) && t.replace(/\s/g, '').length >= 16;
}

/**
 * Shannon 熵（bits/char）估計，用來判斷「像隨機密碼」的程度。
 */
export function entropyPerChar(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export interface PasswordLikeness {
  score: number; // 0..1
  reasons: string[];
}

/**
 * 評估一段文字像不像密碼：長度、字元類別多樣性、熵、無空白。
 */
export function passwordLikeness(s: string): PasswordLikeness {
  const t = s.trim();
  const reasons: string[] = [];
  if (!t || /\s/.test(t)) return { score: 0, reasons: ['含空白或為空'] };
  if (isEmail(t) || isUrl(t)) return { score: 0, reasons: ['像 email/url'] };

  let score = 0;
  const len = t.length;
  if (len >= 8) {
    score += 0.25;
    reasons.push('長度≥8');
  }
  if (len >= 12) {
    score += 0.1;
    reasons.push('長度≥12');
  }

  const classes =
    Number(/[a-z]/.test(t)) +
    Number(/[A-Z]/.test(t)) +
    Number(/\d/.test(t)) +
    Number(/[^A-Za-z0-9]/.test(t));
  score += classes * 0.12; // 最多 0.48
  if (classes >= 3) reasons.push(`字元類別 ${classes} 種`);

  const h = entropyPerChar(t);
  if (h >= 2.5) {
    score += 0.15;
    reasons.push(`熵 ${h.toFixed(1)} bits/char`);
  }

  return { score: Math.min(1, score), reasons };
}
