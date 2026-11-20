-- 《未備份》V1.0 R02-R1：管理員可以用「角色身分」回覆留言
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- comments.as_char：這則留言用哪個角色的身分發（角色 id，例如 yang）；空白＝用本人身分（管理員就是畝 MU）。
-- 只有管理員（is_admin()：管理員帳號＋本次登入通過兩步驟驗證）能填；一般會員填了會被擋（WB_NOT_ADMIN）。
-- 留言送出後誰都不能改這個欄位（UPDATE 權限只有 hidden、removed）。
-- 不改既有的觸發器、政策與資料；既有留言 as_char 都是空白，顯示不變。
-- 角色是不是屬於這部小說由前端選單限制（角色清單在網站的 characters.yml，不在資料庫）。

BEGIN;

ALTER TABLE public.comments ADD COLUMN as_char text
  CHECK (as_char IS NULL OR as_char ~ '^[a-z0-9_]{1,30}$');

CREATE OR REPLACE FUNCTION public.comments_as_char_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if new.as_char is not null and not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.comments_as_char_check() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER comments_as_char_check
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_as_char_check();

GRANT INSERT (as_char) ON public.comments TO authenticated;

COMMIT;

-- 復原（需要時才跑）：
-- BEGIN;
-- DROP TRIGGER IF EXISTS comments_as_char_check ON public.comments;
-- DROP FUNCTION IF EXISTS public.comments_as_char_check();
-- ALTER TABLE public.comments DROP COLUMN IF EXISTS as_char;
-- COMMIT;
