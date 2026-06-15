/** 解密後的資料模型（只在記憶體中存在，永不上傳明文） */

/** 使用者自訂的標籤欄位：容納各平台特有的雜項資訊／密碼。 */
export interface CustomField {
  id: string;
  /** 使用者自訂標籤：理財密碼 / 電話下單密碼 / 代號 / Email / 電話… */
  label: string;
  value: string;
  /** true → 預設遮蔽顯示（密碼類）。 */
  secret?: boolean;
}

export interface Credential {
  id: string;
  /** 統一「帳號」：可為 ID / Email / 電話，由使用者依該平台自填。 */
  username?: string;
  password?: string;
  otp?: string;
  note?: string;
  /** 任意數量的自訂標籤欄位；可選 → 既有密文解密後仍合法（向後相容）。 */
  fields?: CustomField[];
}

export interface ServiceEntry {
  id: string;
  service: string;
  aliases: string[];
  url?: string;
  tags: string[];
  credentials: Credential[];
  createdAt: number;
  updatedAt: number;
}

/** IndexedDB / Firestore 中實際儲存的密文記錄（非敏感） */
export interface EncryptedEntry {
  id: string;
  ciphertext: string; // base64（墓碑記錄為空字串）
  iv: string; // base64（墓碑記錄為空字串）
  rev: number;
  updatedAt: number;
  conflictOf?: string;
  /**
   * 墓碑：true 代表此條目已被刪除。保留一筆刪除標記（而非直接移除），
   * 才能讓刪除事件跨裝置傳播；否則合併會把「只在本機沒有」誤判為「需從遠端拉回」而復活。
   */
  deleted?: boolean;
  /**
   * 本機專用：上次成功與遠端同步時的 rev。用於三方合併偵測「雙方併發修改」。
   * 絕不上傳（remote 序列化時會剝除，且不在 Firestore 欄位白名單內）。
   */
  baseRev?: number;
}
