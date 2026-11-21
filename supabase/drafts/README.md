# 後端安全草案與狀態（V1.0 S09，2026-11-22）

**這個資料夾的 SQL 全部是草案，沒有執行。** 只能由站長在 Supabase SQL Editor 執行；執行前先在後台匯出備份。
GATE-2、GATE-3：未通過。S02-01-D：未啟動。下表「未驗證」＝沒有在正式資料庫實測，不得視為通過。

| 編號 | 內容 | 目前狀態 |
|---|---|---|
| DM-A（前端） | 私訊入口、對話、傳送、刪除、後台私訊分頁 | **已移除**（main，V1.0 S09）；💬 改為前往公開留言；右下角只剩留言通知 |
| DM-A（後端） | 撤銷 dm_messages 新增／讀取／刪除、停用 3 個私訊 RPC，保留歷史資料 | 草案 `022_dm_retire_DRAFT.sql`，**未執行** → 執行前不得宣稱私訊已安全退役 |
| FIX-01 | 固定 UUID 白名單＋user_roles＋aal2（相容既有 is_admin） | 草案 `023_admin_whitelist_session_DRAFT.sql`，未執行 |
| FIX-02 | 全部 public 表 RLS／GRANT／SECURITY DEFINER／search_path 盤點 | 未做：需要最新結構（schema 存檔只到 010；請在 SQL Editor 跑 export_schema.sql 傳給 Claude） |
| FIX-03 | 會員 A 讀不到會員 B 的收藏、進度、私訊 | 未驗證（需兩個測試帳號實測） |
| FIX-04 | 私訊退役安全 | 見 DM-A |
| FIX-05 | comments_as_char_check() 角色與作品歸屬 | 未做：需 021 執行後的實際定義 |
| FIX-06 | 管理 Session：絕對 8 小時、閒置 30 分鐘 | 草案 023（伺服器端判斷）；高風險操作 5 分鐘重新驗證＋綁定操作／資源（FIX-06c）未設計 |
| FIX-07 | 跨裝置登出、Refresh Token、舊 JWT | 未驗證；注意：撤銷 refresh token 不會讓已發出的 access JWT 立即失效（到期前仍有效） |
| FIX-08 | delete_my_account()（020） | 程式在 main；正式資料庫是否已套用**未核對**（本環境連不到 Supabase）；唯讀檢查 `check_020_readonly.sql`（只有 SELECT） |
| FIX-09 | profiles 匿名可讀範圍 | 未做（需最新結構） |
| FIX-10 | 每日 30 天／每月 12 個月備份 | 政策缺口保留；現行每週手動匯出；不得新增 GitHub 高權限金鑰 |
| T01–T15 | 安全測試 | **全部未驗證** |
| DM-T01–DM-T10 | 私訊退役測試 | 前端：私訊呼叫 0 次（本機測試）；後端：未驗證（022 未執行） |

原始條文：S02-01-C、C01–C10、T01–T15、DM-A01–08、DM-T01–10、D17–D21、X1–X6、G01–G08、E01–E25 原文不在 repo，**待補證**。
