-- 《未備份》留言加強：作者標記、留言新回應通知、後台熱門章節
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 1. 作者標記：comments.as_author。管理員帳號留的言自動標記（觸發器決定，前端不能自己設），
--    留言區名字旁邊顯示「作者」。既有的管理員留言一起補上標記。
-- 2. 留言新回應通知：
--    * 讀者在某一頁留過言之後，別人在同一頁又留言 → 算「新回應」
--    * comment_notices()：列出自己有新回應的頁面（只看得到自己的）
--    * comment_mark_read(path)：看過那一頁的留言就清掉（只有自己留過言的頁面才會記錄）
--    * comment_reads 表只透過這兩個函式存取，前端沒有直接權限
-- 3. admin_top_paths()：後台熱門章節（每頁留言數、書籤數），只有管理員能看
-- 正規表示式不使用超過 255 的重複次數，長度一律用 char_length 檢查。

BEGIN;

-- 1. 作者標記
ALTER TABLE public.comments ADD COLUMN as_author boolean NOT NULL DEFAULT false;

UPDATE public.comments c SET as_author = true
WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = c.user_id AND r.role = 'admin');

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

-- 2. 留言新回應通知
CREATE TABLE public.comment_reads (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  path    text NOT NULL CHECK (path ~ '^/[^/\s][^\s]*$' AND char_length(path) <= 300),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, path)
);
ALTER TABLE public.comment_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_reads FROM anon, authenticated;
-- 刻意不建立任何政策、不開任何權限：只能透過下面兩個函式讀寫

CREATE OR REPLACE FUNCTION public.comment_notices()
RETURNS TABLE (path text, novel text, n bigint, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select c.path, max(c.novel), count(*), max(c.created_at)
  from public.comments c
  join (select m.path, min(m.created_at) as first_at
        from public.comments m
        where m.user_id = auth.uid() and not m.removed
        group by m.path) mine on mine.path = c.path
  left join public.comment_reads r on r.user_id = auth.uid() and r.path = c.path
  where auth.uid() is not null
    and c.user_id <> auth.uid() and not c.hidden and not c.removed
    and c.created_at > greatest(mine.first_at, coalesce(r.seen_at, '-infinity'::timestamptz))
  group by c.path
  order by max(c.created_at) desc
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION public.comment_mark_read(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  if exists (select 1 from public.comments where user_id = auth.uid() and path = p_path) then
    insert into public.comment_reads (user_id, path, seen_at) values (auth.uid(), p_path, now())
    on conflict (user_id, path) do update set seen_at = excluded.seen_at;
  end if;
end;
$function$;

-- 3. 後台熱門章節
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
      from public.comments c where not c.removed group by c.path, c.novel
      union all
      select f.path, f.novel, 0::bigint, count(*)
      from public.favorites f where f.path <> '' group by f.path, f.novel
    ) t
    group by t.path
    order by sum(t.cm) + sum(t.mk) desc, sum(t.cm) desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$function$;

REVOKE ALL ON FUNCTION public.comment_notices(), public.comment_mark_read(text), public.admin_top_paths(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_notices(), public.comment_mark_read(text), public.admin_top_paths(integer) TO authenticated;

COMMIT;
