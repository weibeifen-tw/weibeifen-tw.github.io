# 《未備份》人氣後端第一階段｜正式安裝交接（僅站長執行 SQL）

## 本次允許安裝範圍
- 22 部首頁現有作品對照、人氣基準／真實累積總數預留表、管理員調整稽核、公開快照。
- 管理員手動設定人氣後，同交易立即刷新公開快照；首頁已有小眼睛讀取功能。
- **不安裝**匿名觀看計數、章節事件、Edge Function、限流、Cron、每日郵件通知。
- 保留 GitHub `feat/site-popularity-v1`／草稿 PR #1，不得把整份 `026_popularity_v1_DRAFT.sql` 裝進正式 Supabase。

## 執行前的阻擋條件
1. GitHub PR 的「建置檢查（不部署）」和「人氣第一階段資料庫隔離驗證（不部署）」皆成功。
2. 站長已確認正式 Supabase 的可復原備份方式（Dashboard 備份／受控匯出），且能復原到變更前；若沒有可驗證備份，**不得進行正式 SQL 執行**。
3. 正式專案沒有 `popularity_%` 表與函式。若已有，先停止，不能覆蓋。
4. 以站長登入 Supabase SQL Editor，**只執行** `supabase/drafts/028_popularity_phase1_OWNER_APPROVAL.sql` 完整內容一次；不要執行 `026` 或 `027`。SQL 使用 BEGIN/COMMIT；失敗時不得跳過錯誤重跑局部片段。

## SQL 執行後核對（只讀）
```sql
SELECT tablename,rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'popularity_%'
ORDER BY tablename;
SELECT (SELECT count(*) FROM public.popularity_works) AS works,
       (SELECT count(*) FROM public.popularity_adjustment_log) AS adjustments,
       (SELECT count(*) FROM public.popularity_public_snapshot) AS snapshots;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('admin_set_popularity','popularity_publish_snapshot','popularity_snapshot_read')
ORDER BY p.proname;
```
預期：5 張新表全部 RLS 啟用、22 部作品、尚未有手動調整及公開快照（0），三個函式權限符合 SQL；沒有匿名計數函式。

## 網站與後台
1. 完成 SQL 實際核對，才能合併本 PR 到 main 並由 GitHub Pages 正式部署。
2. 管理員登入 `/admin/`，完成 MFA（aal2），進入「人氣」頁，選一本小說設定想要顯示的數字。
3. 調整後立即核對 `popularity_snapshot_read()` 和首頁的小眼睛；此階段首頁「熱門」是已設定人氣的排名，不是自動觀看數。
4. 匿名／一般會員不得呼叫 `admin_set_popularity` 或讀原始人氣表。
5. 調整人氣會留下 `popularity_adjustment_log`；沒有需要時避免進行測試性改寫。

## 失敗處置
- SQL 執行錯誤：停在原地，記錄完整錯誤；不要執行整份 026 SQL。
- 若尚未合併網站，正式前端不受影響。
- 若網站有問題，優先回退前端 PR；**不要直接刪除人氣資料表**。
- `supabase/drafts/028_popularity_phase1_ROLLBACK_DO_NOT_RUN.sql` 是最後手段，會刪除人氣紀錄；必須先備份、確認無第二階段依賴，再由站長另行授權。
- GATE-2／GATE-3 與全部系統正式驗收仍未因此視為通過，只是第一階段有限範圍部署。
