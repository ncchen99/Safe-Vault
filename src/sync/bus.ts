/**
 * 極小事件匯流排：解開 vaultStore ↔ authStore 的循環相依。
 * vaultStore 在本機寫入後 emit；authStore 訂閱以觸發（去抖動的）自動同步。
 */
type Handler = () => void;

const handlers = new Set<Handler>();

export const syncBus = {
  /** 訂閱本機資料變更；回傳取消訂閱函式。 */
  onLocalChange(fn: Handler): () => void {
    handlers.add(fn);
    return () => handlers.delete(fn);
  },
  /** 本機資料已變更（新增 / 編輯 / 刪除 / 匯入）。 */
  emitLocalChange(): void {
    for (const fn of handlers) fn();
  },
};
