-- 《未備份》讀者刪除自己的私訊對話＋清掉重複的帳號名稱檢查
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 1. dm_delete_thread('角色id')：讀者刪掉自己跟這個角色的整段對話（包含角色的回覆），永久刪除。
--    只能刪自己的；回傳刪了幾則。前端仍然沒有 DELETE 權限可以直接刪單則（那是管理員的）。
-- 2. profiles.username 原本有兩個一樣的唯一檢查（建表時的 profiles_username_key、第一批加的
--    profiles_username_uniq），刪掉第一批加的那個索引，保留原本的限制。

BEGIN;

CREATE OR REPLACE FUNCTION public.dm_delete_thread(p_chr text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  delete from public.dm_messages where user_id = auth.uid() and chr = p_chr;
  get diagnostics n = row_count;
  return n;
end;
$function$;

REVOKE ALL ON FUNCTION public.dm_delete_thread(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_delete_thread(text) TO authenticated;

DROP INDEX IF EXISTS public.profiles_username_uniq;

COMMIT;
