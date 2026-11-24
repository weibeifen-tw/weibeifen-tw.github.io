# 《未備份》T03 V2.3｜正式部署前最後修復與阻擋交接（2026-11-24）

> 分支：`feat/site-t03-release-hardening-20261124`；來源：`feat/site-t03-reading-isolation`。僅隔離假資料、GitHub 原始碼與先前獲准的唯讀系統目錄證據。此文件不代表正式部署授權，不得修改 main、正式 Supabase、會員資料或正式網站。

## 1. 基準與已取得證據

- 使用者回報 iPhone Safari／Android Chrome 雙分頁各五項通過；這是五個特定情境，不能替代完整真實 Jekyll／BFCache／PWA 驗證。
- 使用者提供 GitHub Actions「建置檢查（不部署）」#368 成功畫面，對應 T03 SHA 簡寫 `7636b3c`；此成果只適用該 commit，不能直接算本分支新增修改已通過。
- T03 隔離假資料／非同步／回退測試有既有成功紀錄；本分支新增的 guard 只作為編碼與流程回歸保護，不能代表正式安全驗收。
- 原始手機 33 項測試原件缺失；不能以 35 項、新五項或本文件補造。
- 本次唯一實際查閱的正式資料庫資訊為先前授權的 system catalog 查詢（只讀表結構、RLS、GRANT、函式定義），**沒有讀取任何會員資料列**。

## 2. SEC-01 profiles 公開欄位：不擅自變更政策

正式系統目錄顯示：`profiles` 的 SELECT 政策 `USING (true)`，`anon` 與 `authenticated` 均可查詢全表所有列與 11 欄：

- 展示用途候選：`username`, `display_name`, `avatar_url`, `avatar_color`, `bio`。
- 身分識別：`id`（是否必須暴露完整 UUID，需依實際頁面設計核准）。
- 內部時間：`created_at`, `updated_at`, `name_changed_at`, `color_changed_at`, `username_changed_at`（建議不向匿名訪客直接提供，仍待站長確認）。

這是**目前資料庫的實際可讀範圍**，不是外洩已發生的證據。本輪不在 GitHub 放置未核准、可直接執行的正式 SQL 修正，也不擅自關閉既有個人卡片或留言功能。

**站長待核准**：公開個人檔案是否須顯示 biography、完整 UUID、註冊日期及變更時間？核准後另在隔離測試資料庫驗證適當的公開 View/欄位權限或分拆私有表，並核對 PostgREST 關聯查詢相容性；不可只靠隱藏前端欄位來宣稱安全。

## 3. SEC-02 SECURITY DEFINER 函式

前次系統目錄唯讀核對的實際定義：

- `public.is_admin()`：`auth.jwt()->>'aal' = 'aal2'` 且 `public.user_roles` 本人具有 admin；固定空 `search_path`。
- `public.is_banned()`：僅查 `public.banned_users` 中 `auth.uid()` 本人。
- `public.delete_my_account()`：先檢查 `auth.uid()` 非空、本人非 admin 且非 banned，再刪除 `auth.users` 本人的 ID。
- 三者均為 postgres 所有的 SECURITY DEFINER、登入會員可 EXECUTE、anon 不可 EXECUTE。

函式本體未發現可直接傳入「其他會員 ID」的參數；**仍不能替代**真實 JWT/session 過期、授權撤銷、刪除級聯資料與備份保留的測試。維持既有 Gate 未通過。

## 4. 閱讀權限隔離

正式 `public.reading_progress` 已啟用 RLS，`anon` 沒有 SELECT/INSERT/UPDATE，`authenticated` 具有 SELECT/INSERT/UPDATE，三條政策皆以 `auth.uid() = user_id` 限制，UPDATE 同時有 USING/WITH CHECK；無一般會員 DELETE/TRUNCATE 權限。

T03 程式 `assets/js/reading-store.js`、`assets/cloud.js` 將 A/B/guest 狀態分開，`sync` 的 UID 與版本檢查是前端保護；**仍欠真實 JWT + RLS 的端到端交叉讀寫負測試**。沒有本次授權可以操作正式會員列或建立正式測試會員，因此本項維持阻擋，不假報通過。

## 5. 安全回退與備份

- 原 `main` 的舊版 `wb:last:*` 全域同步存在已記錄的跨帳號風險，**不可以直接回退到它**。
- `assets/cloud.js` 已有預設 true 的建置時 `READING_SYNC_ENABLED`；在緊急修正版設成 false，可停用閱讀同步，不應改動收藏／留言。這不是已部署的遠端即時開關。
- `.dev/test-t03-rollback.cjs` 的 15/15 僅是本機假資料模擬，不是正式版本的部署／回退，也不等於資料庫可復原。
- 既定備份政策：每日 30 天、每月 12 個月，重大發布與撤回保留可驗證復原紀錄；GitHub 舊草案描述每週手動匯出，**尚無足夠證據**證明已達既定政策。
- 正式部署阻擋：取得現有備份方式與保存範圍的非會員資料證據、設計不回舊 main 的緊急修正版、在完全隔離的環境做部署→停用同步→恢復及復原驗證。尚未具備正式資料庫備份復原證據。

## 6. 本分支可完成的最小修復

- 增加 `.dev/test-t03-release-guard.cjs`：離線靜態核對 RLS schema 來源、閱讀身分 guard、不得意外解除 emergency sync 開關，並執行既有假資料回退測試。此腳本不連任何正式服務。
- 將此 guard 加入本獨立分支的 GitHub Actions「建置檢查（不部署）」，限定本分支。所有測試僅在 runner 的隔離環境執行。
- 本分支不變更 `profiles` 正式權限、不修改 `cloud.js` 產品邏輯、不使用正式 JWT/會員資料。

## 7. 最終 Gate 與驗收

| 門檻 | 判定 |
| --- | --- |
| iPhone/Android 五情境 | 人工回報通過 |
| T03 #368 | 舊指定版本成功，新增分支須另核對 |
| 閱讀 RLS 靜態設定 | 通過 |
| profiles 公開欄位最終範圍 | **待站長隱私決策** |
| SECURITY DEFINER 靜態核讀 | 完成，端到端仍待補證 |
| 假資料 rollback | 既有 15/15 通過 |
| 正式備份與安全 rollback | **阻擋** |
| 真實 JWT/RLS 跨身分測試 | **阻擋** |
| main / 正式 Supabase / 正式部署 | **一律未授權** |

本分支完成後停止供站長人工驗收，不自行 PR／Merge／Deploy。
