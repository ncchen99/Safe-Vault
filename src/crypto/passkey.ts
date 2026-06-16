/**
 * Passkey 解鎖（WebAuthn PRF）。
 *
 * 原理：用 WebAuthn 的 PRF extension 取得一段「由裝置驗證（指紋／Face ID／裝置密碼）解鎖、
 * 綁定此裝置」的穩定秘密，經 HKDF 派生成 AES-GCM 金鑰，再用它**額外包裝一份 VK**
 * （`wrappedVK_byPRF`），與既有的主密碼 / 復原碼包裝並存。
 *
 * 零知識不變：PRF 秘密永不離開裝置、永不上傳；伺服器（Firebase）只接觸密文。
 * Google 登入只證明身分、無法解密——解密金鑰仍只在記憶體。
 *
 * 注意：PRF 需真實平台驗證器（如 macOS Touch ID + Chrome/Safari），
 * 瀏覽器支援不一；不支援時優雅退回主密碼解鎖。
 */
import { base64ToBytes, bytesToBase64, utf8ToBytes } from './encoding';
import { unwrapVaultKey, wrapVaultKey, type WrappedKey } from './keyWrap';

/**
 * 本機專用的 Passkey 金鑰包裝（絕不上傳）。
 *
 * 信任模型（#7）：`wrappedVK` 存於未加密的 IndexedDB。它本身不違反零知識（不離開裝置），
 * 但其安全性等同「裝置完整性 + 平台驗證器（Touch ID/Face）的生物辨識把關」：
 * 攻擊者即使讀到 `wrappedVK`，仍需通過生物辨識才能取得 PRF 秘密解開它。
 * 若平台驗證器被繞過或裝置已被入侵，此包裝即非最後防線——此時請改用主密碼/復原碼解鎖。
 */
export interface PasskeyKeyset {
  /** WebAuthn credential rawId（base64），解鎖時用於 allowCredentials。 */
  credentialId: string;
  /** PRF 評估用 salt（base64），固定後 PRF 輸出才穩定。 */
  prfSalt: string;
  /** 以 PRF 派生金鑰包裝的 VK。 */
  wrappedVK: WrappedKey;
}

/**
 * 此裝置雖支援 Passkey，但無法用於解鎖金庫（瀏覽器未提供 PRF 擴充）。
 * UI 可據此放行「略過、改用復原碼」的退路，避免使用者卡死在強制設定步驟。
 */
export class PasskeyUnsupportedError extends Error {
  readonly code = 'PASSKEY_UNSUPPORTED';
  constructor(message = '此裝置的 Passkey 無法用於解鎖金庫，請改用主密碼或復原碼') {
    super(message);
    this.name = 'PasskeyUnsupportedError';
  }
}

/** 此環境是否可能支援 Passkey。 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials
  );
}

function rpId(): string {
  return window.location.hostname || 'localhost';
}

/** Uint8Array → ArrayBuffer（避免 ArrayBufferLike / SharedArrayBuffer 型別歧義）。 */
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

/**
 * HKDF 域分離 salt（固定且具版本）。非空 salt 確保此 PRF 派生與其他用途／其他應用
 * 不會碰撞，即使底層 PRF 輸出存在微小偏誤也有額外分離保證。
 * 固定值即可（salt 不需保密）；變更此常數會使既有 passkey 包裝失效。
 */
const HKDF_SALT = utf8ToBytes('safevault-prf-hkdf-salt-v1');

/** HKDF：PRF 秘密 → 用於 wrap/unwrap VK 的 AES-GCM 金鑰。 */
export async function derivePrfKey(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: ab(HKDF_SALT),
      info: ab(utf8ToBytes('safevault-prf-vk')),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );
}

/** 觸發一次生物辨識並取得 PRF 秘密（會跳出系統指紋/Face 提示）。 */
async function evaluatePrf(
  credentialId: Uint8Array,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: ab(challenge),
      rpId: rpId(),
      allowCredentials: [{ id: ab(credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60_000,
      // PRF extension（部分 TS lib 尚未含型別）
      extensions: { prf: { eval: { first: ab(salt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Passkey 驗證已取消');
  const results = (
    assertion.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } };
    }
  ).prf?.results?.first;
  if (!results)
    throw new PasskeyUnsupportedError(
      '此裝置的 Passkey 無法用於解鎖金庫（瀏覽器未提供 PRF），請改用主密碼或復原碼',
    );
  return results;
}

/**
 * 啟用指紋解鎖：建立 Passkey → 取 PRF 秘密 → 以其派生金鑰包裝目前的 VK。
 * 需在金庫已解鎖（手上有 VK）時呼叫。
 */
export async function enablePasskey(
  vk: CryptoKey,
  label = 'SafeVault',
): Promise<PasskeyKeyset> {
  if (!isPasskeySupported()) throw new Error('此瀏覽器不支援 Passkey');
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'SafeVault', id: rpId() },
      user: { id: ab(userId), name: label, displayName: label },
      challenge: ab(challenge),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60_000,
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey 建立已取消');

  const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
  if (ext.prf?.enabled === false) {
    throw new PasskeyUnsupportedError(
      '此裝置的 Passkey 無法用於解鎖金庫（不支援 PRF），請改用主密碼或復原碼',
    );
  }

  const credentialId = new Uint8Array(cred.rawId);
  const secret = await evaluatePrf(credentialId, prfSalt);
  const prfKey = await derivePrfKey(secret);
  const wrappedVK = await wrapVaultKey(vk, prfKey);

  return {
    credentialId: bytesToBase64(credentialId),
    prfSalt: bytesToBase64(prfSalt),
    wrappedVK,
  };
}

/** 用指紋解鎖：取 PRF 秘密 → 派生金鑰 → 解出 VK。 */
export async function unlockVKWithPasskey(
  passkey: PasskeyKeyset,
): Promise<CryptoKey> {
  const credentialId = base64ToBytes(passkey.credentialId);
  const salt = base64ToBytes(passkey.prfSalt);
  const secret = await evaluatePrf(credentialId, salt);
  const prfKey = await derivePrfKey(secret);
  return unwrapVaultKey(passkey.wrappedVK, prfKey);
}
