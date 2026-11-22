-- ============================================================================
-- 024 草案：封鎖會員 → 自動隱藏他全部的歷史留言；解除封鎖 → 自動恢復（V1.1 Q08、Q09）
-- 狀態：**草案，沒有執行**。V1.1 工作 B 不授權執行 SQL、不授權修改正式資料庫。
--       只能由站長在 Supabase SQL Editor 執行；執行前先在後台匯出備份。
-- ----------------------------------------------------------------------------
-- 為什麼要改資料庫：
--   現在 admin_ban(p_remove_comments => true) 是把留言設成 removed = true（＝個別刪除）。
--   這樣解除封鎖時分不出「因封鎖被藏」和「管理員個別刪除」，沒辦法照 Q09 自動恢復。
-- 做法（不新增欄位、不動既有資料）：
--   1. 「封鎖隱藏」不再寫進留言本身，而是讀取時判斷：作者在 banned_users 裡 → 不公開。
--      解除封鎖（從 banned_users 刪掉）→ 這些留言自動回來。
--   2. 「個別刪除」照舊用 removed = true；解除封鎖不會恢復 removed 的留言（符合 Q09）。
--   3. 被檢舉自動隱藏（hidden）規則不變。
--   4. 管理員照舊看得到全部（含被封鎖會員的留言）。
-- 風險：
--   R1 banned_users 對 anon／authenticated 沒有任何權限（011）。RLS 裡不能直接查它，
--      所以新增 SECURITY DEFINER 函式 comment_author_banned(uuid)，只回傳 true/false。
--      副作用：任何人知道某會員 uuid 就能問出「他有沒有被封鎖」（不含原因、時間）。
--      若不能接受，改成「新增 comments.ban_hidden 欄位＋admin_ban/unban 同步改」的版本（見檔尾 B 案）。
--   R2 每筆留言多一次函式呼叫；留言一頁最多 300 筆，banned_users 有主鍵，影響很小。
--   R3 執行後，既有「封鎖時順便移除留言」產生的 removed = true 不會自動恢復
--      （它們當時就是寫成個別刪除）。要恢復請管理員在後台「已隱藏」逐則恢復。
--   R4 admin_ban 的第三個參數保留（相容舊前端），但改成不再動留言；
--      admin.js 的確認視窗文字要在 SQL 執行後一起改（目前前端未改，避免文字與正式資料庫行為不一致）。
-- 回復（rollback）：見檔尾「ROLLBACK」段，把 006 的兩條 policy 和 011 的 admin_ban 原樣建回。
-- 驗證（執行後，用兩個測試帳號）：
--   V1 會員 X 留言 → 訪客、會員 Y 看得到。
--   V2 管理員封鎖 X → 訪客、會員 Y 都看不到 X 的全部留言；留言數同步減少；管理員仍看得到。
--   V3 管理員個別刪除 X 的其中一則 → 解除封鎖 X → 其餘留言回來，被個別刪除那則仍看不到。
--   V4 X 被封鎖期間不能新增留言（既有 comments_before_insert 規則）。
-- ============================================================================

BEGIN;

-- 1. 只回傳 true/false 的檢查函式（RLS 用）
CREATE OR REPLACE FUNCTION public.comment_author_banned(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.banned_users WHERE user_id = p_user);
$function$;
REVOKE ALL ON FUNCTION public.comment_author_banned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comment_author_banned(uuid) TO anon, authenticated;

-- 2. 讀取規則：多加「作者沒有被封鎖」
DROP POLICY IF EXISTS "comments public read" ON public.comments;
DROP POLICY IF EXISTS "comments member read" ON public.comments;
CREATE POLICY "comments public read" ON public.comments FOR SELECT TO anon
  USING (NOT hidden AND NOT removed AND NOT public.comment_author_banned(user_id));
CREATE POLICY "comments member read" ON public.comments FOR SELECT TO authenticated
  USING (
    (NOT removed AND NOT public.comment_author_banned(user_id)
      AND (NOT hidden OR (SELECT auth.uid()) = user_id))
    OR (SELECT public.is_admin())
  );

-- 3. admin_ban：封鎖只寫 banned_users，不再把留言改成 removed（個別刪除另外做）
CREATE OR REPLACE FUNCTION public.admin_ban(p_user uuid, p_reason text DEFAULT NULL, p_remove_comments boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  n integer := 0;
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') then
    raise exception 'WB_CANNOT_BAN_ADMIN';
  end if;
  insert into public.banned_users (user_id, reason)
  values (p_user, nullif(left(btrim(coalesce(p_reason, '')), 200), ''))
  on conflict (user_id) do update set reason = excluded.reason;
  -- p_remove_comments 保留相容，不再使用；回傳「因封鎖被隱藏」的留言數
  select count(*) into n from public.comments where user_id = p_user and not removed;
  return n;
end;
$function$;
-- admin_unban 不用改：從 banned_users 刪掉後，留言自動恢復。

-- 4. 後台「熱門篇章」留言數：同樣排除被封鎖會員
CREATE OR REPLACE FUNCTION public.admin_top_paths(p_limit integer DEFAULT 20)
RETURNS TABLE (path text, novel text, comments bigint, marks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return query
    select t.path, max(t.novel), sum(t.cm)::bigint, sum(t.mk)::bigint
    from (
      select c.path, c.novel, count(*) as cm, 0::bigint as mk
      from public.comments c
      where not c.removed
        and not exists (select 1 from public.banned_users b where b.user_id = c.user_id)
      group by c.path, c.novel
      union all
      select f.path, f.novel, 0::bigint, count(*)
      from public.favorites f where f.path <> '' group by f.path, f.novel
    ) t
    group by t.path
    order by sum(t.cm) + sum(t.mk) desc, sum(t.cm) desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$function$;

COMMIT;

-- ============================================================================
-- ROLLBACK（出問題時整段執行，恢復成 006＋010＋011 的行為）
-- ----------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS "comments public read" ON public.comments;
-- DROP POLICY IF EXISTS "comments member read" ON public.comments;
-- CREATE POLICY "comments public read" ON public.comments FOR SELECT TO anon
--   USING (NOT hidden AND NOT removed);
-- CREATE POLICY "comments member read" ON public.comments FOR SELECT TO authenticated
--   USING ((NOT removed AND (NOT hidden OR (SELECT auth.uid()) = user_id)) OR (SELECT public.is_admin()));
-- -- admin_ban、admin_top_paths：把 supabase/011_ban_snippets.sql、010_comments_plus.sql 裡的原始定義整段重新執行
-- DROP FUNCTION IF EXISTS public.comment_author_banned(uuid);
-- COMMIT;
-- ============================================================================
-- B 案（若不接受 R1）：comments 新增 ban_hidden boolean NOT NULL DEFAULT false；
--   admin_ban 設 ban_hidden = true（不動 removed）；admin_unban 設 ban_hidden = false；
--   policy 改成 NOT ban_hidden。缺點：要改表結構，封鎖期間新增的留言（理論上被擋）要另外處理。
-- ============================================================================
