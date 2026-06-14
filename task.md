# SafeVault — 工作追蹤 (task.md)

> 最高原則：**密碼絕不以明文離開使用者裝置**。後端只接觸密文或非敏感資料（零知識）。
> 安全性優先於任何衝突的設計取捨。

狀態圖例：`[x]` 完成 · `[~]` 進行中 · `[ ]` 待辦 · `[!]` 阻塞/待釐清

---

## M1 — 專案骨架 + 本地 MVP ✅（已驗收）

- [x] 工程設定：Vite 6 + React 18 + TS strict、Tailwind/DaisyUI、Vitest、vite-plugin-pwa
- [x] 加密核心 `src/crypto/`
  - [x] `kdf.ts` Argon2id（hash-wasm）+ PBKDF2 600k fallback
  - [x] `keyWrap.ts` VK 產生 / wrap / unwrap（AES-256-GCM）
  - [x] `vault.ts` 條目加解密（AES-256-GCM, per-entry IV）
  - [x] `recovery.ts` 128-bit 復原碼（Crockford base32, ABCD-EFGH 分組）
  - [x] `vaultSetup.ts` 建庫 / 主密碼解鎖 / 復原碼救回 / 換主密碼（只重包 VK）
- [x] 本地儲存 `src/db/`：Dexie 只存密文；meta + entries 表
- [x] 狀態 `src/store/vaultStore.ts`：VK 僅記憶體、閒置 5 分鐘自動上鎖
- [x] 搜尋 `src/search/`：別名字典 + trigram(Dice) + Levenshtein
- [x] UI：建庫 / 解鎖 / Emergency Kit / 金庫清單（分割線）/ 條目表單
- [x] 響應式：桌面 Modal ↔ 手機 Bottom Sheet；觸控 ≥44px；深淺色 WCAG AA
- [x] Firestore Rules 草案 + Hosting 安全標頭
- [x] 測試：crypto 4 + search 4（含拼錯/別名）→ 全綠
- [x] 瀏覽器端對端驗證（臉書→Facebook 別名搜尋）

---

## M2 — 智慧匯入解析管線 ✅（已驗收）

目標：貼上雜亂文字 → 正規化 → 啟發式切分 → FSM 解析 → **AI 猜測、使用者逐張確認**（非全自動）。

### 解析管線 `src/import/`
- [x] `canonicalize.ts` 文字正規化（統一換行、去零寬字元/NBSP、壓縮空行）+ `splitLabeled`（避免誤切 URI scheme）
- [x] `tokens.ts` 欄位偵測器（email/url/phone/otpauth/bare TOTP secret）+ Shannon 熵密碼相似度
- [x] `labels.ts` 多語標籤字典（中英、帳號/password/網址/OTP/備註…）
- [x] `segment.ts` 區塊切分（分隔線 / 空行 / 重複 schema 起始點偵測 → 多筆）
- [x] `fsm.ts` 兩遍式解析：先處理 labeled 行，再依內容歸位 → {service, username, password, url, otp, note} + 各欄位信心
- [x] `score.ts` 整筆品質分 + needsReview（缺 service/password/identity 或低信心）
- [x] `pipeline.ts` 串接 + 既有條目重複偵測 + `candidateToEntry`

### 型別
- [x] `src/types/import.ts`：`ImportCandidate { id, fields, confidence, quality, rawBlock, needsReview, duplicateOf }`

### 確認 UI `src/features/import/`
- [x] `ImportPage.tsx`：貼上區（textarea + 範例）→「解析」→候選清單 → 逐張確認 → 匯入
- [x] `CandidateCard.tsx`：逐筆顯示猜測欄位、信心 badge、低信心高亮、可逐欄編輯、勾選納入/略過、密碼遮罩
- [x] 批次：勾選納入 → `vaultStore.saveMany`（一次加密寫入、enrich 別名）
- [x] 接上 `VaultPage` 底部「匯入」按鈕（移除 placeholder）

### 測試
- [x] `import.test.ts`（10 測）：label:value、空行多筆、--- 分隔、無標籤 email/url、otpauth、缺密碼→review、網域推導 service、重複偵測、空輸入、candidateToEntry

### 隱私守則
- [x] 解析全程在本機；匯入文字不送任何網路（純函式管線，無 fetch）

### 瀏覽器端對端驗證
- [x] 貼上 4 筆雜亂樣本 → 正確切分；otpauth→OTP；網域→Dropbox；`帳號 - user12345` dash 切分；缺欄位標記需確認 → 匯入 4 筆 → 「臉書」搜尋命中 Facebook；console 乾淨

---

## M3 — E2EE Firestore 同步 + 忘記主密碼

- [ ] Firebase 專案建立 + `.env.example` / `.env`（apiKey 等公開設定）
- [ ] `src/firebase/app.ts` 初始化（Auth/Firestore），Emulator 連線開關
- [ ] Google 登入流程（僅 Google Auth）+ App unlock 與 Auth 分層
- [ ] `src/sync/` 推拉同步：以 `vaultRev` / per-entry `rev` 做版本控制
  - [ ] 上傳：只送 `{ciphertext, iv, rev, updatedAt}` 與 meta 包裝金鑰
  - [ ] 下載：合併；衝突 → `conflictOf` 保留雙版本
- [ ] 換裝置流程：Google 登入 → 拉 meta → 輸入主密碼 → 解 VK → 解金庫
- [ ] 忘記主密碼：復原碼 → RK → unwrap `wrappedVK_byRK` → 設定新主密碼（重包 MEK）
- [ ] Firestore Security Rules 測試（`@firebase/rules-unit-testing`）：跨 uid 拒絕、欄位白名單
- [ ] 「無後門」明確告知 UI 文案
- [ ] Emulator 端對端：兩裝置模擬同步、衝突、復原

---

## M4 — 語意搜尋（可選增強）

- [ ] 評估小型 on-device embedding（如 Transformers.js MiniLM）成本/體積
- [ ] `src/search/semantic.ts`：可選載入、與現有 lexical 搜尋融合排序
- [ ] 降級策略：模型未載入時純 lexical；尊重流量/離線
- [ ] 測試：語意近義（「網銀」≈「online banking」）

---

## M5 — a11y / 效能 / 離線 / 安裝打磨

- [ ] PWA 圖示資產：`pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png`
- [ ] Lighthouse PWA / a11y / 效能 ≥ 目標
- [ ] 鍵盤導航、focus ring、aria 標籤全面檢查
- [ ] `prefers-reduced-motion` 全面套用
- [ ] 離線可用驗證（斷網新增/搜尋/解鎖）
- [ ] 安裝體驗（install prompt、splash、theme-color）

---

## 跨里程碑待補
- [ ] PWA 圖示（M5 但 manifest 已引用，缺檔）
- [ ] `.env.example`（M3）
- [ ] CI（lint + test + build）— 可選

## 變更紀錄
- 2026-06-15 建立 task.md；M1 標記完成，開始 M2。
- 2026-06-15 M2 智慧匯入完成：解析管線 + 確認 UI + 10 測；瀏覽器端對端驗證通過（總測試 20/20）。下一步 M3。
