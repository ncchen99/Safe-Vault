/**
 * 多語標籤字典：把人類寫的欄位標籤對應到內部欄位鍵。
 * 中英混用、大小寫不敏感。
 */
import type { FieldKey } from '@/types/import';

const LABEL_MAP: Record<string, FieldKey> = {};

function register(field: FieldKey, labels: string[]) {
  for (const l of labels) LABEL_MAP[l.toLowerCase()] = field;
}

register('service', ['service', 'site', 'name', 'app', '服務', '網站', '名稱', '平台', '應用']);
register('username', [
  'username', 'user', 'user name', 'login', 'account', 'acct', 'id', 'email', 'e-mail', 'mail',
  '帳號', '帳戶', '使用者', '使用者名稱', '用戶', '用戶名', '登入', '信箱', '電子郵件', '郵箱',
]);
register('password', [
  'password', 'pass', 'passwd', 'pwd', 'pw', 'secret',
  '密碼', '通行碼', '通行密碼', '口令',
]);
register('url', ['url', 'link', 'website', 'web', 'address', 'addr', '網址', '連結', '位址']);
register('otp', [
  'otp', '2fa', 'totp', 'mfa', 'authenticator', 'auth', 'token', 'verification', '2-step',
  '驗證碼', '兩步驟', '二階段', '雙因子', '動態密碼', '驗證器',
]);
register('note', ['note', 'notes', 'memo', 'remark', 'comment', 'desc', 'description', '備註', '備注', '說明', '註記', '筆記']);

/** 由標籤字串解析欄位鍵；無對應回 undefined。 */
export function labelToField(label: string): FieldKey | undefined {
  return LABEL_MAP[label.trim().toLowerCase()];
}
