-- ============================================================================
-- 022 私訊全面退役（DM-A）— 草案，尚未執行。只能由站長在 Supabase SQL Editor 執行。
-- V1.0 S09（2026-11-22）。前端已於 feat/site-v1-s09 停止讀寫私訊；這份才是「後端封鎖」。
--
-- 做什麼：
--   1. 會員（authenticated）不能再新增、讀取、刪除 dm_messages（撤銷權限＋拿掉政策）
--   2. 停用 dm_mark_seen、admin_dm_threads、dm_delete_thread（撤銷執行權，不刪函式）
-- 不做什麼：
--   - 不刪 dm_messages 表、不刪任何歷史訊息（DM-A：歷史資料暫時保留）
--   - 不動 dm_before_insert 觸發器、不動外鍵 ON DELETE CASCADE（刪帳號時照樣連帶刪除該會員的私訊）
--   - admin_export()（SECURITY DEFINER）照樣能匯出 dm_messages，每週備份不受影響
--
-- 執行前：後台「統計」→「匯出全部資料」下載一份備份。
-- 執行順序：先合併前端（已上線 V1.0 S09），再執行這份。
-- ============================================================================
BEGIN;

-- 1. 新增
REVOKE INSERT (user_id, chr, post, from_char, body) ON public.dm_messages FROM authenticated;
REVOKE INSERT ON public.dm_messages FROM authenticated;
DROP POLICY IF EXISTS "dm insert own or admin" ON public.dm_messages;

-- 2. 讀取、刪除
REVOKE SELECT, DELETE ON public.dm_messages FROM authenticated;
DROP POLICY IF EXISTS "dm read own or admin" ON public.dm_messages;
DROP POLICY IF EXISTS "dm admin delete" ON public.dm_messages;
-- RLS 保持開啟；沒有任何政策＝一般連線全部拒絕
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- 3. 私訊 RPC
REVOKE EXECUTE ON FUNCTION public.dm_mark_seen(text, uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_dm_threads() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dm_delete_thread(text) FROM authenticated, anon, PUBLIC;

COMMIT;

-- ============================================================================
-- 驗證（DM-T 對應；執行後在 SQL Editor 跑，全部應為 false）
-- ============================================================================
-- select has_table_privilege('authenticated','public.dm_messages','INSERT') as ins,
--        has_table_privilege('authenticated','public.dm_messages','SELECT') as sel,
--        has_table_privilege('authenticated','public.dm_messages','DELETE') as del,
--        has_function_privilege('authenticated','public.dm_mark_seen(text, uuid)','EXECUTE') as mark_seen,
--        has_function_privilege('authenticated','public.admin_dm_threads()','EXECUTE') as threads,
--        has_function_privilege('authenticated','public.dm_delete_thread(text)','EXECUTE') as del_thread;
-- select polname from pg_policy where polrelid = 'public.dm_messages'::regclass;   -- 應為 0 列
-- select count(*) from public.dm_messages;                                         -- 歷史筆數應與執行前相同

-- ============================================================================
-- 復原（需要時才執行；回到 007 的設定）
-- ============================================================================
-- BEGIN;
-- GRANT SELECT, DELETE ON public.dm_messages TO authenticated;
-- GRANT INSERT (user_id, chr, post, from_char, body) ON public.dm_messages TO authenticated;
-- 政策內容請照 supabase/007_dm.sql 第 73–78 行重建三條 POLICY。
-- GRANT EXECUTE ON FUNCTION public.dm_mark_seen(text, uuid), public.admin_dm_threads(), public.dm_delete_thread(text) TO authenticated;
-- COMMIT;
