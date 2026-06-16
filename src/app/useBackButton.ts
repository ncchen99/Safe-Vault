/**
 * useBackButton — 攔截手機的硬體/系統返回鍵。
 *
 * 當 `active` 為 true 時，push 一個空的 history state。
 * 使用者按下返回鍵會觸發 popstate，我們呼叫 onBack() 關閉 modal / 切換頁面。
 * 當 `active` 變回 false（例如 modal 被正常關閉）時，若之前 push 的 state
 * 仍在 history 頂端，則呼叫 history.back() 清除多餘的 entry。
 *
 * 使用 unique sentinel 避免多層 dialog 互相干擾。
 */
import { useEffect, useRef } from 'react';

// A global stack of active sentinels currently in the browser history
const historySentinels: string[] = [];

export function useBackButton(active: boolean, onBack: () => void) {
  const sentinelRef = useRef<string | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) {
      const sentinel = sentinelRef.current;
      if (sentinel) {
        sentinelRef.current = null;
        // 延遲執行 pop，避免與 StrictMode 的 synchronous mount/unmount 衝突
        setTimeout(() => {
          const idx = historySentinels.indexOf(sentinel);
          if (idx !== -1) {
            historySentinels.splice(idx, 1);
            if (history.state?.__backSentinel === sentinel) {
              history.back();
            }
          }
        }, 0);
      }
      return;
    }

    const sentinel = sentinelRef.current || `back-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sentinelRef.current = sentinel;

    // 延遲執行 pushState
    const timeoutId = setTimeout(() => {
      if (historySentinels.includes(sentinel)) return;
      historySentinels.push(sentinel);
      history.pushState({ __backSentinel: sentinel }, '');
    }, 0);

    function handlePopState() {
      if (history.state?.__backSentinel !== sentinel) {
        const idx = historySentinels.indexOf(sentinel);
        if (idx !== -1) {
          historySentinels.splice(idx, 1);
        }
        sentinelRef.current = null;
        onBackRef.current();
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('popstate', handlePopState);
      
      const currentSentinel = sentinelRef.current;
      if (currentSentinel) {
        setTimeout(() => {
          const idx = historySentinels.indexOf(currentSentinel);
          if (idx !== -1) {
            historySentinels.splice(idx, 1);
            if (history.state?.__backSentinel === currentSentinel) {
              history.back();
            }
          }
        }, 0);
      }
    };
  }, [active]);
}
