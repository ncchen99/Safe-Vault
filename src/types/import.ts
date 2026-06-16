/**
 * 智慧匯入的中間資料模型。
 * 全程只存在於使用者裝置記憶體；解析過程不送任何網路請求。
 */

/** 解析出的自訂標籤欄位（對應 Credential.CustomField，不含 id）。 */
export interface ImportCustomField {
  label: string;
  value: string;
  secret?: boolean;
}

/** 可被匯入的欄位（對應最終 ServiceEntry / Credential 的子集合） */
export interface ImportFields {
  service?: string;
  username?: string;
  password?: string;
  url?: string;
  otp?: string;
  note?: string;
  /** 標籤未命中字典的雜項欄位（理財密碼、卡片密碼、電話…），逐筆保留結構。 */
  fields?: ImportCustomField[];
}

/** 具信心值的固定純量欄位（不含自訂 fields 陣列）。 */
export type FieldKey = 'service' | 'username' | 'password' | 'url' | 'otp' | 'note';

export const FIELD_KEYS: FieldKey[] = [
  'service',
  'username',
  'password',
  'url',
  'otp',
  'note',
];

/** 解析後的單筆候選；由使用者逐張確認，非全自動寫入。 */
export interface ImportCandidate {
  id: string;
  fields: ImportFields;
  /** 各欄位信心 0..1（只含有值的欄位） */
  confidence: Partial<Record<FieldKey, number>>;
  /** 整筆品質分 0..1 */
  quality: number;
  /** 原始區塊文字（供使用者對照） */
  rawBlock: string;
  /** 是否建議人工檢視（低品質或缺關鍵欄位） */
  needsReview: boolean;
  /** 與既有條目疑似重複的 service 名稱（顯示提示用，不阻擋） */
  duplicateOf?: string;
  /**
   * 命中的既有條目 id。匯入確認時據此「併入既有條目」而非新建一筆，
   * 避免重複貼上同份資料時跨裝置產生兩份（合併以 id 配對）。
   */
  duplicateId?: string;
}
