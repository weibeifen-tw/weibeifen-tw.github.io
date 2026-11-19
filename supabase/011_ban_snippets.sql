-- 《未備份》封鎖會員、後台常用語
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 1. 封鎖會員
--    * banned_users 表：被封鎖的會員。只能透過 admin_ban() / admin_unban() 改，前端沒有直接權限
--    * 被封鎖的人：不能留言、不能傳私訊、不能檢舉、不能改個人資料；還是可以登入、看小說、收藏、書櫃
--    * 不能封鎖管理員；封鎖時可選擇一起移除他所有的留言（跟後台「刪除」一樣，之後可在「已隱藏」恢復）
--    * admin_member_list() 多回傳 banned、ban_reason（回傳欄位變了，所以先刪掉再重建）
-- 2. 後台常用語：admin_snippets 表，只有管理員（aal2）能讀、新增、刪除
-- 正規表示式不使用超過 255 的重複次數，長度一律用 char_length 檢查。

BEGIN;

-- 1. 封鎖會員
CREATE TABLE public.banned_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  reason     text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.banned_users FROM anon, authenticated;
-- 刻意不建立政策、不開權限：只能透過下面的函式

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.banned_users WHERE user_id = (SELECT auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.is_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated;

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
  if p_remove_comments then
    update public.comments set removed = true where user_id = p_user and not removed;
    get diagnostics n = row_count;
  end if;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_unban(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  delete from public.banned_users where user_id = p_user;
end;
$function$;

REVOKE ALL ON FUNCTION public.admin_ban(uuid, text, boolean), public.admin_unban(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban(uuid, text, boolean), public.admin_unban(uuid) TO authenticated;

-- 留言：被封鎖就擋（其餘跟 010 相同）
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
  if exists (select 1 from public.banned_users where user_id = new.user_id) then
    raise exception 'WB_BANNED';
  end if;
  new.as_author  := exists (select 1 from public.user_roles
                            where user_id = new.user_id and role = 'admin');
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

-- 私訊：讀者被封鎖就擋（其餘跟 007 相同）
CREATE OR REPLACE FUNCTION public.dm_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  new.created_at := now();
  new.seen       := false;
  new.body       := btrim(new.body);
  if auth.uid() is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  if new.from_char then
    if not public.is_admin() then
      raise exception 'WB_NOT_ADMIN';
    end if;
  else
    new.user_id := auth.uid();
    if exists (select 1 from public.banned_users where user_id = new.user_id) then
      raise exception 'WB_BANNED';
    end if;
    if exists (select 1 from public.dm_messages
               where user_id = new.user_id and not from_char
                 and created_at > now() - interval '5 seconds') then
      raise exception 'WB_TOO_FAST';
    end if;
    if (select count(*) from public.dm_messages
        where user_id = new.user_id and not from_char
          and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'WB_TOO_MANY';
    end if;
  end if;
  return new;
end;
$function$;

-- 檢舉、改個人資料：被封鎖就不行
DROP POLICY "reports insert own" ON public.comment_reports;
CREATE POLICY "reports insert own" ON public.comment_reports FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND NOT (SELECT public.is_banned()));

DROP POLICY "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id AND NOT (SELECT public.is_banned()));

-- 會員列表多兩個欄位
DROP FUNCTION public.admin_member_list();
CREATE FUNCTION public.admin_member_list()
RETURNS TABLE (id uuid, display_name text, username text, role text, created_at timestamptz,
               comments bigint, banned boolean, ban_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return query
    select p.id, p.display_name, p.username, coalesce(r.role, 'reader'), p.created_at,
           (select count(*) from public.comments c where c.user_id = p.id),
           (b.user_id is not null), b.reason
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    left join public.banned_users b on b.user_id = p.id
    order by p.created_at desc;
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_member_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_member_list() TO authenticated;

-- 2. 後台常用語
CREATE TABLE public.admin_snippets (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snippets admin read" ON public.admin_snippets FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
CREATE POLICY "snippets admin insert" ON public.admin_snippets FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "snippets admin delete" ON public.admin_snippets FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));
REVOKE ALL ON public.admin_snippets FROM anon, authenticated;
GRANT SELECT, DELETE ON public.admin_snippets TO authenticated;
GRANT INSERT (body) ON public.admin_snippets TO authenticated;

COMMIT;
