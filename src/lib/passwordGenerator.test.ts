import { describe, expect, it } from 'vitest';
import { generatePassword } from './passwordGenerator';

describe('passwordGenerator', () => {
  it('產生的密碼預設長度為 10', () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(10);
  });

  it('支援自訂長度', () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(8)).toHaveLength(8);
  });

  it('長度小於 4 時拋出錯誤', () => {
    expect(() => generatePassword(3)).toThrow();
  });

  it('重複 500 次皆包含大寫字母、小寫字母、數字與符號', () => {
    for (let i = 0; i < 500; i++) {
      const pw = generatePassword(10);
      expect(pw).toHaveLength(10);
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[0-9]/.test(pw)).toBe(true);
      expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
    }
  });
});
