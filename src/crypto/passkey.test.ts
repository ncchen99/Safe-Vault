import { describe, it, expect } from 'vitest';
import { derivePrfKey } from './passkey';
import { generateVaultKey, wrapVaultKey, unwrapVaultKey } from './keyWrap';
import { encryptEntry, decryptEntry } from './vault';
import type { ServiceEntry } from '@/types/entry';

function entry(): ServiceEntry {
  return {
    id: 'e1',
    service: 'Demo',
    aliases: [],
    tags: [],
    credentials: [{ id: 'c1', password: 'hunter2-PRF' }],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('Passkey PRF 金鑰包裝', () => {
  it('同一 PRF 秘密派生的金鑰可 wrap/unwrap 同一把 VK', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32)).buffer;
    // HKDF 決定性：同秘密兩次派生 → 可互換的金鑰
    const k1 = await derivePrfKey(secret);
    const k2 = await derivePrfKey(secret);

    const vk = await generateVaultKey();
    const wrapped = await wrapVaultKey(vk, k1);
    const vk2 = await unwrapVaultKey(wrapped, k2);

    // 用解回的 VK 應能解開原 VK 加密的條目
    const rec = await encryptEntry(entry(), vk);
    const back = await decryptEntry(rec, vk2);
    expect(back.credentials[0].password).toBe('hunter2-PRF');
  });

  it('不同 PRF 秘密無法解開（GCM 驗證失敗）', async () => {
    const vk = await generateVaultKey();
    const good = await derivePrfKey(
      crypto.getRandomValues(new Uint8Array(32)).buffer,
    );
    const bad = await derivePrfKey(
      crypto.getRandomValues(new Uint8Array(32)).buffer,
    );
    const wrapped = await wrapVaultKey(vk, good);
    await expect(unwrapVaultKey(wrapped, bad)).rejects.toBeTruthy();
  });
});
