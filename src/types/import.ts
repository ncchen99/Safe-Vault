/**
 * 智慧匯入的中間資料模型。
 * 全程只存在於使用者裝置記憶體；解析過程不送任何網路請求。
 */

/** 可被匯入的欄位（對應最終 ServiceEntry / Credential 的子集合） */
export interface ImportFields {
  service?: string;
  username?: string;
  password?: string;
  url?: string;
  otp?: string;
  note?: string;
}

export type FieldKey = keyof ImportFields;

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
  /** 與既有條目疑似重複的 service（提示，不阻擋） */
  duplicateOf?: string;
}
