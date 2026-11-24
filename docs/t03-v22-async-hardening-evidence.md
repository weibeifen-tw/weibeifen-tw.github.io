# 《未備份》P3-01 T03-R01～R03｜V2.2 第二輪非同步競態風險補強及驗收紀錄

> 日期：2026-11-24。經站長授權只在 T03 獨立分支補強 V22-R01～R04；禁止 main／正式網站部署、PR／Merge、正式 Supabase 操作、SQL 與真實會員資料處理。本文件不是正式部署核准，也不能替代正式 RLS 或真實瀏覽器測試。

## 一、程式變更及依據

### V22-R01｜會員頁舊資料覆蓋

- `assets/member.js` 新增 `memberViewEpoch` 及 `currentOwner(id,version)`：保護登入驗證、會員角色、個人資料返回及儲存結果，避免原會員 A 請求晚到後重繪會員 B 畫面。
- 登入事件會使舊登入驗證失效並重新驗證新快取會員；登出會使舊回應失效。
- 管理員 MFA 狀態、權限確認及註冊回應加入當前會員身分守衛，避免舊回應修改新使用者的畫面。
- 其他分頁清除網站儲存空間（`storage.key === null`）時，會員入口會重新讀取快取頭像。

### V22-R02｜雲端初始驗證及登入事件

- `assets/cloud.js` 提前註冊 `onAuthStateChange` 回調，並以 `authGeneration` 防止晚到的初始 `getVerifiedUser` 結果及舊的 `SIGNED_IN` 請求復原錯誤會員狀態。
- 原本 `Store.setIdentity('member', id)` 的回傳值改為必要判斷，失敗時不可繼續同步。
- `sync(A)` 原有 UID／version 驗證及上傳前再次取得 `getVerifiedUser()` 的保護維持，不放寬原有讀寫隔離。

### V22-R03｜後端 RLS

- **只讀核對程式來源**：`supabase/003_batch2.sql` 與 `supabase/schema_2026-11-20.sql` 對 `public.reading_progress` 均宣告啟用 RLS；SELECT / INSERT / UPDATE 政策使用 `auth.uid() = user_id`，UPDATE 有 `USING` 與 `WITH CHECK`。
- 不曾對正式 Supabase 執行 SQL、核實目前實際 RLS、JWT／session 撤銷或跨帳號資料存取。**V22-R03 不可結案**。

### V22-R04｜帳號刪除及登出

- `assets/member.js` 在帳號刪除驗證 **之前** 擷取原 owner UID／identity version／畫面 epoch；於刪除 RPC 發送前及回覆後重新檢查，防止舊回應登出或清除新登入 B 的本機資料。
- 登出／全部裝置登出若回應期間換人，阻止舊回應重新繪製新帳號畫面。
- 注意：上述僅前端回應保護。真實 `delete_my_account`、RPC 伺服器授權身分、網路中途換人、備份及帳號正式刪除結果仍須獨立安全核對。**V22-R04 不可完全結案**。

## 二、隔離回歸結果

| 測試 | 結果 | 限制 |
| --- | --- | --- |
| `.dev/test-t03-reading.cjs` | 38／38 通過 | JS 假環境 |
| `.dev/test-t03-rollback.cjs` | 15／15 通過 | 假資料回退模擬 |
| `.dev/test-t03-preview.cjs` | 23／23 通過 | 本機假資料預覽檢查 |
| 新增 `.dev/test-t03-async-races.cjs` | 11／11 通過 | 從實際分支 member/cloud 原始碼抽取對應函數，在假帳號與可延遲 Promise 環境測試：驗證、角色、profile、連續登入、登出、帳號刪除競態 |
| 主要 JS 語法及轉譯後 SW | 通過 | 不代表完整 Jekyll 或瀏覽器實測 |

`.github/workflows/build-check.yml` 原有 T03 分支限定測試步驟已加入 `node .dev/test-t03-async-races.cjs`。尚無這次新 Commit 對應 GitHub Actions 執行成功之可核實 run/job 證據，不能宣稱 CI 通過。

## 三、剩餘風險與 Gate

| 風險 | 本輪判定 | 正式部署前必須取得 |
| --- | --- | --- |
| V22-R01 | 前端主要舊回應畫面防護已補強，實際頁面待測 | 完整 /member/、管理員 MFA、個人資料更改及跨裝置瀏覽器整合 |
| V22-R02 | 雲端登入事件已補強，網路競態待測 | 真實 SDK 驗證事件、請求晚到、局部同步失敗及瀏覽器 BFCache |
| V22-R03 | 原始 SQL 結構只讀檢查；**未解除** | 正式 RLS / JWT / anon / authenticated / owner 隔離證據，需另外明確授權 |
| V22-R04 | 前端刪除／登出回應防護已補強；**未解除** | 獨立假後端對帳、正式帳號刪除權限／復原安全審核，不得使用真實會員演練 |

另外保留：最新 Jekyll 建置、手機原始 33 項回歸、iPhone 真實完整網站及 Android Chrome、實際安全 Rollback、備份及正式資料刪除門檻。

## 四、不可自行推進的範圍

- 本輪不建立 PR、不 Merge、不 Deploy、不變更 Vercel 已公開的獨立四檔假資料預覽，不發布本輪 member/cloud 修改。
- 不修改 `main`、`weibeifen.com`、正式 Supabase、任何真實會員資料或小說正文。
- 保留原手機 33 項紀錄、T01/T02 待補證、T03-R01～R03 及 T03-U01～U03、V1.0 原 116 個審查 ID、前 11 頁核准決策、原五階段計畫及 S1-F01～S1-F04。
- S1-02、P3-01-D、T04 持續暫停。

**V2.2 第二輪開發補強完成後停下供站長人工驗收；只有隔離測試通過，不得轉成正式發布核准。**
