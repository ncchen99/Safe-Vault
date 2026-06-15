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

## M3 — E2EE Firestore 同步 + 忘記主密碼 ✅（程式完成；待真實 Firebase/Emulator 驗收）

- [~] Firebase 專案建立 + `.env.example` / `.env`：`.env.example` 已就緒；需使用者填入真實專案 ID 才會啟用同步
- [x] `src/firebase/config.ts` + `app.ts`：lazy 單例初始化（Auth/Firestore），`VITE_USE_EMULATORS` 連線開關；未設定時 `isFirebaseConfigured=false` → 純本地模式
- [x] `src/firebase/auth.ts` Google 登入/登出/訂閱；`authStore` 與金庫解鎖分層（登入 ≠ 解鎖）
- [x] `src/sync/` 推拉同步：以 `vaultRev`（meta）/ per-entry `rev` + 本機專用 `baseRev` 做三方版本控制
  - [x] 上傳：`remote.ts` 只送白名單欄位 `{ciphertext, iv, rev, updatedAt, conflictOf?}`，剝除 `baseRev`
  - [x] 下載合併：`merge.ts` 純函式 LWW（updatedAt→rev）；雙方併發 → `conflictOf` 保留落敗副本
  - [x] 同步鏈動態載入（`vaultStore.syncWithRemote` 內 `import()`）→ 純本地不載入 Firebase SDK（主 chunk 795→329 kB）
- [x] 換裝置流程：登入 → 拉 meta + 密文 → 輸入主密碼解 VK → 解金庫（`syncWithRemote` + 既有 `unlock`）
- [x] 忘記主密碼：復原碼 → RK → unwrap `wrappedVK_byRK` → `rekeyVault` 設新主密碼 + **全新復原碼**（舊碼失效）
  - 修正潛在問題：換密碼時 MEK/RK 共用同一份新 `kdfParams`，避免舊 `wrappedVK_byRK` 因換 salt 而無法解開
- [~] Firestore Security Rules 測試 `src/sync/rules.test.ts`：已撰寫（跨 uid 拒絕／欄位白名單／未登入拒絕），預設 skip；需 `npm i -D @firebase/rules-unit-testing` + Emulator 才會跑
- [x] 「無後門」UI 文案：CreateVault / RecoveryKitModal / ForgotPassword / SyncControls
- [ ] Emulator 端對端：兩裝置模擬同步、衝突、復原（需安裝 rules-unit-testing 並啟動 Emulator）

### 已在瀏覽器驗證（本地、無 Firebase）
- [x] 忘記主密碼端對端：建庫→匯入 2 筆→鎖定→以復原碼重設新主密碼 → 2 筆條目完整解出、產生新復原碼、舊主密碼被拒、新主密碼可解鎖

### 已知限制（待後續）
- 刪除尚未同步（無 tombstone）：`removeEntry` 僅刪本機，刪除不會傳播到其他裝置。

---

## M4 — 語意搜尋（概念字典）✅

- [x] 評估 on-device embedding（Transformers.js MiniLM）成本/體積 →
  結論：對短小多語服務標籤而言，數十 MB 權重 + 第三方 CDN 下載與「離線優先、
  輕量」最高原則相違，CP 值低。改採**策展式多語概念字典**（零網路、即時、可離線）
- [x] `src/search/semantic.ts`：概念字典（banking/email/social/…）+ 概念標註；
  以 `conceptsOf` / `semanticScore` 與既有 lexical 融合（lexical 未達門檻時補救）
- [x] 降級策略：本字典本身即為離線基準；保留 `SemanticBackend` 擴充點供日後接 embedding
- [x] 測試：`semantic.test.ts` 5 測——跨語近義（網銀≈online banking≈bank）、
  無關詞不誤判、概念交集給分、融合搜尋、精確命中仍優先
- [x] 瀏覽器端對端驗證：建庫→新增「Online Banking」→搜「網銀」命中、搜「遊戲」不誤中、console 乾淨

---

## M5 — a11y / 效能 / 離線 / 安裝打磨 ✅

- [x] PWA 圖示資產：`public/pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png`
  （由 `icon-source.svg` 經 WebKit/QuickLook 渲染 → 全幅 maskable-safe 盾牌圖；三檔皆 HTTP 200）
- [x] 鍵盤導航、focus-visible ring、aria 標籤（既有 `index.css` + 各元件 aria-label）
- [x] `prefers-reduced-motion` 全面套用（`index.css`）
- [x] 安裝體驗：`InstallPrompt`（beforeinstallprompt / appinstalled、可關閉、已安裝不顯示）、
  splash（manifest background_color）、theme-color 一致為 `#4f46e5`（html meta 與 manifest）、
  iOS meta（apple-mobile-web-app-*、apple-touch-icon link）
- [x] 離線可用驗證：service worker 已註冊且 active（scope `/`），圖示/wasm 納入 precache
- [~] Lighthouse PWA / a11y / 效能：本機環境未跑 Lighthouse；建議使用者於 `npm run build && npm run preview` 後自行量測

---

## 跨里程碑待補
- [x] PWA 圖示（manifest 已引用，已補檔）
- [x] `.env.example`（M3）/ `.env`（使用者已填真實 Firebase 專案）
- [ ] CI（lint + test + build）— 可選
- [!] Firestore Rules 測試 / Emulator 端對端：本機**無 Java 執行環境**，Firestore Emulator
  無法啟動 → `src/sync/rules.test.ts` 維持 gated/skip。待有 JRE 後：
  `npm i -D @firebase/rules-unit-testing` + `firebase emulators:exec --only firestore "RUN_RULES_TESTS=true npx vitest run src/sync/rules.test.ts"`
- 註：`.env` 目前 `VITE_USE_EMULATORS=true`，正式雲端同步請改為 `false`

## 變更紀錄
- 2026-06-15 建立 task.md；M1 標記完成，開始 M2。
- 2026-06-15 M2 智慧匯入完成：解析管線 + 確認 UI + 10 測；瀏覽器端對端驗證通過（總測試 20/20）。下一步 M3。
- 2026-06-15 M3 E2EE 同步 + 忘記主密碼：firebase（config/app/auth）+ sync（remote/merge/sync）+ authStore + ForgotPassword/SyncControls；merge 純函式 9 測、rules 測試 5（gated）。tsc 乾淨、總測試 29/29 通過、build 成功且 Firebase 拆為 lazy chunk。忘記主密碼流程瀏覽器端對端驗證通過。待真實 Firebase 專案 / Emulator 做雲端同步驗收。
- 2026-06-15 服務 icon（全本機、零網路）：精選 simple-icons 103 個品牌（`scripts/gen-brands.mjs` 產生 → `src/icons/brands.generated.ts`，執行期不依賴 simple-icons）；`src/icons/match.ts` 三層比對（品牌 slug／網域／中文別名 → 在地關鍵字分類 → 概念字典分類），`glyphs.tsx` 以 Heroicons solid 當分類字形（各家網銀→銀行字形）；`ServiceIcon` 取代字母頭貼，單色 currentColor 契合灰階。**刻意不抓遠端 favicon**（會外洩服務清單）。台灣在地：中文行名靠概念字典自動歸類、英文短名（CTBC/E.SUN…）靠在地關鍵字表。+6 測（共 41 通過）。瀏覽器驗證：GitHub/Netflix 顯示品牌標誌、玉山銀行/CTBC 顯示銀行字形、未知服務退回字母；網路面板僅 localhost 與 inline data:（零外部請求）。注意：主 chunk 因內嵌品牌 path 增約 50 kB(gzip)，已納入 PWA precache。`npm run gen:brands` 可重產。
- 2026-06-15 介面極簡改版（灰階）：DaisyUI 主題改 stone 灰階＋全域直角（rounded 全 0）；按鈕反轉對比（淺色=深灰鈕／深色=淺灰鈕）；底部動作列改為一條橫切兩半（左匯入｜右新增）；空狀態「新增條目」改無邊框；服務頭貼改方形灰階；新增/匯入/檢視在手機改為「整頁」呈現（左上叉叉，非 modal）；PWA 圖示/favicon/theme-color 一併灰階化。順手修正：EntryForm 改為開啟時才掛載，避免重開或切換編輯對象時殘留上一筆欄位值。tsc 乾淨、34/34 測試、build 成功；淺/深兩模式瀏覽器驗證通過、console 乾淨。
- 2026-06-15 M4 語意搜尋：`semantic.ts` 多語概念字典融合 lexical（網銀≈online banking），零網路/可離線；+5 測。M5 打磨：補齊 PWA 三圖示（maskable-safe）、InstallPrompt、theme-color 一致化、iOS meta。tsc 乾淨、總測試 **34/34 通過**（rules 5 gated/skip）、build 成功（主 chunk 332 kB、Firebase 仍 lazy）。瀏覽器端對端：語意搜尋命中/不誤中、manifest+三圖示 200、SW active。**Firestore rules 測試因本機無 JRE 無法啟動 Emulator**，維持 gated。
- 2026-06-15 彈性欄位 + 表單/列表/解析改版（Phase 1）：
  - 資料模型：`Credential` 新增可選 `fields: CustomField[]{label,value,secret?}`（向後相容，密文/同步不受影響）；主帳號統一「帳號」（ID/Email/電話自填）。
  - 服務名正規化：`canonicalServiceName()`（重用品牌比對）→ FB/臉書 → Facebook，原輸入存入 aliases（搜尋仍命中）。
  - 表單（`EntryForm`）大改：儲存移到 Header 右上（`<form id>`＋`form=` 連動，避開虛擬鍵盤）；網址/標籤收進「進階」收合；備註改 spoiler 收合；每組帳密可加自訂欄位（標籤＋值＋機密遮蔽切換）。`ResponsiveSheet` 加 `headerAction` 插槽。
  - 列表（`EntryRow`）：帳號上／密碼（遮蔽）下；點整列＝複製密碼、點箭頭＝檢視/編輯（分離兩鈕）。
  - 解析升級（`fsm.ts`/`pipeline.ts`/`CandidateCard`）：保留任意標籤欄位（理財密碼/卡片密碼/電話下單密碼/代號…）為自訂機密欄位；支援「標籤獨佔一行、值在下一行」配對與「標籤＋空白＋值」；電話另存為「電話」欄位。`ImportFields` 加 `fields`，`FieldKey` 固定為 6 純量鍵。
  - 限制：無分隔符的黏連標籤（代號f74…）與無任何標籤的多值區塊屬本質模糊，盡力猜測並標「需確認」，由確認 UI＋彈性欄位保全。
  - 驗證：tsc 乾淨、**47/47 測試通過**（+6）、瀏覽器手機端對端：FB→Facebook、列表帳密上下排與雙鈕、自訂欄位 round-trip、匯入台新證券/Richart 真實雜亂資料正確拆出各機密欄位；console 乾淨、網路僅 localhost＋inline data:（零外部請求）。clipboard 複製於 headless 預覽因權限受限無法讀回（程式邏輯未變）。
  - 待辦（Phase 2，未動工）：Passkey（WebAuthn PRF）指紋解鎖——`wrappedVK_byPRF` 第三道包裝、Google 登入＋註冊 Passkey 的免密碼 onboarding、復原碼為備援；PRF 需真機生物辨識，預覽環境無法自動驗證。
- 2026-06-15 Passkey 指紋解鎖（Phase 2）＋ UI 微調：
  - Passkey/PRF：新增 `src/crypto/passkey.ts`——WebAuthn PRF extension 取生物辨識綁定秘密 → HKDF → AES-GCM 金鑰 → **額外包裝一份 VK**（與主密碼/復原碼並存）。`enablePasskey(vk)`／`unlockVKWithPasskey()`／`derivePrfKey()`／`isPasskeySupported()`。本機儲存 `VaultMeta.passkey{credentialId,prfSalt,wrappedVK}`（`repo.savePasskey/clearPasskey`，**絕不上傳**）。`vaultStore` 加 `passkeySupported/hasPasskey` 與 `unlockWithPasskey/enablePasskey/disablePasskey`。UI：`UnlockVault` 在已啟用時顯示「用指紋解鎖」；`VaultPage` header 加指紋按鈕（啟用/停用）。零知識不變：PRF 秘密永不離裝置、Google 登入仍無法解密。
  - **限制**：WebAuthn PRF 需真機平台驗證器（macOS Touch ID + Chrome/Safari）；預覽 headless 無法觸發生物辨識，故僅程式層 + 特性偵測驗證，未做真機指紋端對端。免密碼 onboarding（建庫即註冊 Passkey、復原碼為唯一備援）尚未串：目前 Passkey 為「已解鎖後一鍵啟用」，仍保留主密碼。
  - UI 微調：① 取消多組帳密——`EntryForm` 改單一帳密扁平版面（移除「帳密一/二」「新增一組帳密」與卡片框），一個帳號＝一個 Row。② 服務名查詢表升級為「同帳號群組」：Gmail/Google Drive/Google Photos/YouTube…→「Google 帳號」；App Store/iCloud/Apple Music→「Apple ID」；Messenger→Facebook；Instagram 維持獨立。群組名仍對得回品牌 icon（加 `appleid→apple` 別名）。
  - 驗證：tsc 乾淨、**52/52 測試通過**（+5：PRF wrap/unwrap roundtrip 2、群組 3）、瀏覽器手機端對端：新增表單為單一帳密無卡片、Gmail→Google 帳號（Google icon）、指紋按鈕在 header 顯示且特性偵測正確（`PublicKeyCredential` 可用）；console 乾淨。

##  — Onboarding 導覽、彩色 icon、Snackbar、即時/離線自動同步、刪除墓碑

- **首次導覽（Onboarding）**：`src/features/onboarding/Onboarding.tsx` 四張卡片（零知識 / 指紋+Google 跨裝置 / 一鍵匯入 / 新增與搜尋），完成狀態存 localStorage；App 以 `NoVaultFlow` 在建庫前先顯示。
- **彩色品牌 icon**：`gen-brands.mjs` 加入 `hex`，`brands.generated.ts` 重新產生；`ServiceIcon` 改為品牌色底＋對比自動取白/深 logo（App 圖示風）。
- **Snackbar 複製回饋**：`store/toastStore.ts` + `components/Snackbar.tsx`；EntryRow 點列複製密碼（已複製密碼），無密碼則複製帳號（已複製帳號），3 秒淡出。
- **即時 + 離線自動同步**：`sync/bus.ts` 解耦事件匯流排；`remote.ts` `subscribeRemote`（onSnapshot 即時拉取，略過本機回音）；authStore 去抖動同步 + online/visibilitychange 補同步；vaultStore 寫入/解鎖時 emit。
- **跨裝置刪除**：以墓碑（`EncryptedEntry.deleted`）取代硬刪，避免合併把「本機已刪」誤判為「需從遠端拉回」而復活；`firestore.rules` 白名單加 `deleted`（需 `firebase deploy --only firestore:rules` 才生效）。
- 驗證：tsc 乾淨、vitest 55 通過（+3 墓碑合併測試）、vite build 成功、瀏覽器手機端驗證（導覽、彩色 icon、Snackbar「已複製密碼」、零外部請求）。
