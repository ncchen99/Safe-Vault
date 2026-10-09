/**
 * 表單草稿自動儲存：snapshot 變動後去抖寫入；另外在
 *  - 元件卸載（關閉表單）時，
 *  - 金庫上鎖前（含閒置自動上鎖），
 * 立即把尚未寫入的變更存檔，避免忘記按儲存或上鎖後輸入遺失。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useVaultStore } from '@/store/vaultStore';

const DEBOUNCE_MS = 600;

/**
 * @param snapshot 草稿序列化結果；與上次已存內容不同即視為有變更。
 * @param save 實際寫入（以最新草稿建立條目並儲存）。
 * @param canSave 草稿是否值得儲存（例如新增時尚未輸入任何內容 → false）。
 * @returns flush：立即寫入尚未儲存的變更；discard：放棄後續寫入（條目已刪除時）。
 */
export function useAutoSave(
  snapshot: string,
  save: () => Promise<void>,
  canSave = true,
): { flush: () => Promise<void>; discard: () => void } {
  const registerFlush = useVaultStore((s) => s.registerFlush);
  const lastSaved = useRef(snapshot);
  // 以 ref 持有最新值，讓 flush 不需隨每次輸入重建，卸載時也能拿到最新草稿。
  const latest = useRef({ snapshot, save, canSave });
  latest.current = { snapshot, save, canSave };
  // 串接寫入，避免去抖寫入與 flush 同時進行造成 rev 競態。
  const pending = useRef<Promise<void>>(Promise.resolve());
  const discarded = useRef(false);

  const flush = useCallback(() => {
    pending.current = pending.current.then(async () => {
      const { snapshot: snap, save: doSave, canSave: ok } = latest.current;
      if (discarded.current || !ok || snap === lastSaved.current) return;
      lastSaved.current = snap;
      try {
        await doSave();
      } catch (e) {
        lastSaved.current = ''; // 寫入失敗 → 下次仍視為有變更
        throw e;
      }
    });
    return pending.current;
  }, []);

  // 去抖：任何欄位變動後 DEBOUNCE_MS 無新變更即寫入。
  useEffect(() => {
    if (!canSave || snapshot === lastSaved.current) return;
    const t = setTimeout(() => void flush().catch(() => {}), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [snapshot, canSave, flush]);

  // 上鎖前 flush；卸載時也 flush（關閉表單不會丟掉最後幾個字）。
  useEffect(() => {
    const unregister = registerFlush(flush);
    return () => {
      unregister();
      void flush().catch(() => {});
    };
  }, [registerFlush, flush]);

  const discard = useCallback(() => {
    discarded.current = true;
  }, []);

  return { flush, discard };
}
