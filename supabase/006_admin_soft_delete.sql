-- 《未備份》管理員刪除留言改成「移除」：讀者和作者都看不到，但管理後台的「已隱藏」看得到，可以恢復或永久刪除。
-- 在 Supabase → SQL Editor 整段貼上執行一次。
-- 會員刪除「自己的」留言仍然是真的刪除。

BEGIN;

ALTER TABLE public.comments ADD COLUMN removed boolean NOT NULL DEFAULT false;

-- 讀取規則：被管理員移除的，連作者本人也看不到；只有管理員看得到
DROP POLICY "comments public read" ON public.comments;
DROP POLICY "comments member read" ON public.comments;
CREATE POLICY "comments public read" ON public.comments FOR SELECT TO anon
  USING (NOT hidden AND NOT removed);
CREATE POLICY "comments member read" ON public.comments FOR SELECT TO authenticated
  USING ((NOT removed AND (NOT hidden OR (SELECT auth.uid()) = user_id)) OR (SELECT public.is_admin()));

-- 管理員可以改 hidden、removed（移除／恢復）
GRANT UPDATE (hidden, removed) ON public.comments TO authenticated;

-- 新留言一律不是移除狀態
CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  new.user_id    := auth.uid();
  new.created_at := now();
  new.hidden     := false;
  new.removed    := false;
  new.body       := btrim(new.body);
  if new.user_id is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  if exists (select 1 from public.comments
             where user_id = new.user_id and created_at > now() - interval '15 seconds') then
    raise exception 'WB_TOO_FAST';
  end if;
  if (select count(*) from public.comments
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'WB_TOO_MANY';
  end if;
  return new;
end;
$function$;

COMMIT;
