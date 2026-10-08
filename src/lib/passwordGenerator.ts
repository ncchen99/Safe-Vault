/**
 * 密碼產生器：產生指定長度、包含大寫字母、小寫字母、數字與符號的隨機密碼。
 * 使用 Web Crypto API (CSPRNG) 確保密碼具備密碼學安全隨機性。
 */

export const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
export const DIGIT_CHARS = '0123456789';
export const SYMBOL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS + SYMBOL_CHARS;

function getRandomInt(max: number): number {
  const array = new Uint32Array(1);
  const maxValid = 0x100000000 - (0x100000000 % max);
  let val: number;
  do {
    crypto.getRandomValues(array);
    val = array[0];
  } while (val >= maxValid);
  return val % max;
}

function getRandomChar(chars: string): string {
  return chars[getRandomInt(chars.length)];
}

/**
 * 產生預設 10 位長，保證包含大寫字母、小寫字母、數字與符號的密碼。
 */
export function generatePassword(length = 10): string {
  if (length < 4) {
    throw new Error('密碼長度至少需為 4 以包含所有字元類別');
  }

  // 確保四種字元類別各至少出現一次
  const chars: string[] = [
    getRandomChar(UPPERCASE_CHARS),
    getRandomChar(LOWERCASE_CHARS),
    getRandomChar(DIGIT_CHARS),
    getRandomChar(SYMBOL_CHARS),
  ];

  // 其餘位置自所有字元集合中隨機抽選
  for (let i = 4; i < length; i++) {
    chars.push(getRandomChar(ALL_CHARS));
  }

  // Fisher-Yates 洗牌演算法打亂順序
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}
