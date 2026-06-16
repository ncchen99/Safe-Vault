/**
 * 高階金鑰流程編排：建立金庫、解鎖、換主密碼、復原。
 * 回傳的 VK CryptoKey 僅供記憶體使用；wrapped 結果可安全存 IndexedDB / Firestore。
 */
import {
  deriveKeyMaterial,
  defaultKdfParams,
  importWrappingKey,
  type KdfParams,
} from './kdf';
import {
  generateVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
  type WrappedKey,
} from './keyWrap';
import { generateRecoveryCode, normalizeRecoveryCode } from './recovery';

export interface VaultKeyset {
  kdfParams: KdfParams;
  /**
   * 主密碼包裝。**可選**：免密碼金庫（指紋 + 復原碼）沒有這把包裝；
   * 之後若使用者另設主密碼才會補上。
   */
  wrappedVK_byMEK?: WrappedKey;
  wrappedVK_byRK: WrappedKey;
}

export interface NewVault extends VaultKeyset {
  recoveryCode: string;
  vk: CryptoKey;
}

/** 免密碼金庫的 keyset（沒有 MEK；解鎖靠指紋 PRF，備援靠復原碼）。 */
export interface PasswordlessVault {
  kdfParams: KdfParams;
  wrappedVK_byRK: WrappedKey;
  recoveryCode: string;
  vk: CryptoKey;
}

/**
 * 建立免密碼金庫：產生 VK + 復原碼，只用復原碼（RK）包裝一份。
 * 指紋（PRF）包裝由 enablePasskey 在取得 VK 後另外補上；
 * 復原碼是唯一可攜的秘密（換裝置時用它還原）。
 */
export async function createPasswordlessVault(): Promise<PasswordlessVault> {
  const kdfParams = defaultKdfParams();
  const recoveryCode = generateRecoveryCode();
  const rk = await importWrappingKey(
    await deriveKeyMaterial(normalizeRecoveryCode(recoveryCode), kdfParams),
  );
  const vk = await generateVaultKey();
  const wrappedVK_byRK = await wrapVaultKey(vk, rk);
  return { kdfParams, wrappedVK_byRK, recoveryCode, vk };
}

/** 建立新金庫：產生 VK + 復原碼，並用 MEK / RK 各包裝一份 */
export async function createVault(masterPassword: string): Promise<NewVault> {
  const kdfParams = defaultKdfParams();
  const recoveryCode = generateRecoveryCode();

  const mek = await importWrappingKey(
    await deriveKeyMaterial(masterPassword, kdfParams),
  );
  const rk = await importWrappingKey(
    await deriveKeyMaterial(normalizeRecoveryCode(recoveryCode), kdfParams),
  );

  const vk = await generateVaultKey();
  const wrappedVK_byMEK = await wrapVaultKey(vk, mek);
  const wrappedVK_byRK = await wrapVaultKey(vk, rk);

  return { kdfParams, wrappedVK_byMEK, wrappedVK_byRK, recoveryCode, vk };
}

/**
 * 以既有 VK 重新建立整組金鑰包裝：產生新的 kdfParams、新主密碼的 MEK、
 * 以及**全新的復原碼**（使舊復原碼失效，符合規格 §10.2）。
 * 用於「忘記主密碼」復原後重設，或已解鎖狀態下重新產生 Emergency Kit。
 * MEK 與 RK 共用同一份 kdfParams，確保兩份 wrap 永遠可被對應金鑰解開。
 */
export async function rekeyVault(
  vk: CryptoKey,
  newMasterPassword: string,
): Promise<Omit<NewVault, 'vk'>> {
  const kdfParams = defaultKdfParams();
  const recoveryCode = generateRecoveryCode();

  const mek = await importWrappingKey(
    await deriveKeyMaterial(newMasterPassword, kdfParams),
  );
  const rk = await importWrappingKey(
    await deriveKeyMaterial(normalizeRecoveryCode(recoveryCode), kdfParams),
  );

  const wrappedVK_byMEK = await wrapVaultKey(vk, mek);
  const wrappedVK_byRK = await wrapVaultKey(vk, rk);

  return { kdfParams, wrappedVK_byMEK, wrappedVK_byRK, recoveryCode };
}

/**
 * 用主密碼解鎖：派生 MEK → unwrap VK。
 *
 * `extractable` 預設 false：日常解鎖得到的 VK 不可匯出（見 keyWrap.unwrapVaultKey）。
 * 只有「解鎖後還要重新包裝 VK」的特權流程（例如在設定中啟用指紋）才會傳 true，
 * 並且必須伴隨重新輸入主密碼驗證。
 */
export async function unlockWithMasterPassword(
  masterPassword: string,
  keyset: Pick<VaultKeyset, 'kdfParams' | 'wrappedVK_byMEK'>,
  extractable = false,
): Promise<CryptoKey> {
  if (!keyset.wrappedVK_byMEK) {
    throw new Error('此金庫未設定主密碼，請改用 Passkey 或復原碼');
  }
  const mek = await importWrappingKey(
    await deriveKeyMaterial(masterPassword, keyset.kdfParams),
  );
  return unwrapVaultKey(keyset.wrappedVK_byMEK, mek, extractable);
}

/**
 * 用復原碼取回 VK。回傳的 VK 為**可匯出**：復原是裝置設定流程，
 * 後續通常緊接著 rekeyVault（換主密碼）或 enablePasskey（重新包裝 VK），
 * 兩者都需要可匯出的 VK 才能 wrap。
 */
export async function recoverWithCode(
  recoveryCode: string,
  keyset: Pick<VaultKeyset, 'kdfParams' | 'wrappedVK_byRK'>,
): Promise<CryptoKey> {
  const rk = await importWrappingKey(
    await deriveKeyMaterial(
      normalizeRecoveryCode(recoveryCode),
      keyset.kdfParams,
    ),
  );
  return unwrapVaultKey(keyset.wrappedVK_byRK, rk, true);
}
