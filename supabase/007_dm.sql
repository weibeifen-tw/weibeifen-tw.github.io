-- 《未備份》會員系統第五批：私訊角色存到雲端，管理員用角色身分回覆
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 設計：
--   * 一則私訊＝一列。對話串＝（讀者 user_id, 角色 chr）。
--     from_char = false：讀者傳給角色；from_char = true：管理員以角色身分回覆。
--   * 讀者只看得到自己的對話；管理員（admin＋已通過兩步驟驗證）看得到全部。
--   * 讀者只能用自己的身分傳、不能冒充角色；只有管理員能傳 from_char = true。
--   * 防洗版（只限讀者）：5 秒 1 則、1 小時 30 則。管理員回覆不限。
--   * 不能編輯。刪除只有管理員能做（永久刪除）。
--   * 已讀：seen 欄位只能透過 dm_mark_seen() 改，前端沒有 UPDATE 權限。
--   * 正規表示式不使用超過 255 的重複次數，長度一律用 char_length 檢查。

BEGIN;

-- 1. 私訊
CREATE TABLE public.dm_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE CASCADE,
  chr        text NOT NULL CHECK (chr ~ '^[a-z0-9_-]{1,40}$'),
  post       text CHECK (post IS NULL OR post ~ '^[a-z0-9_-]{1,80}$'),  -- 從哪一篇貼文點進來（posts.json 的 key），可空
  from_char  boolean NOT NULL DEFAULT false,
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  seen       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dm_messages_thread_idx ON public.dm_messages (user_id, chr, created_at);
CREATE INDEX dm_messages_unseen_idx ON public.dm_messages (user_id, from_char) WHERE NOT seen;

-- 2. 新增前：固定時間、未讀；讀者固定為本人且不能冒充角色；檢查頻率
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
REVOKE ALL ON FUNCTION public.dm_before_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dm_before_insert
  BEFORE INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.dm_before_insert();

-- 3. RLS
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm read own or admin" ON public.dm_messages FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));
CREATE POLICY "dm insert own or admin" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id AND NOT from_char) OR (SELECT public.is_admin()));
CREATE POLICY "dm admin delete" ON public.dm_messages FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 4. 已讀
--   讀者：dm_mark_seen('角色id') → 把這個角色回給自己的訊息標成已讀
--   管理員：dm_mark_seen('角色id', '讀者uuid') → 把這位讀者傳給角色的訊息標成已讀
CREATE OR REPLACE FUNCTION public.dm_mark_seen(p_chr text, p_user uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  if p_user is null then
    update public.dm_messages set seen = true
      where user_id = auth.uid() and chr = p_chr and from_char and not seen;
  else
    if not public.is_admin() then
      raise exception 'WB_NOT_ADMIN';
    end if;
    update public.dm_messages set seen = true
      where user_id = p_user and chr = p_chr and not from_char and not seen;
  end if;
end;
$function$;

-- 5. 管理後台：對話串列表（每位讀者 × 每個角色一列）
CREATE OR REPLACE FUNCTION public.admin_dm_threads()
RETURNS TABLE (user_id uuid, display_name text, username text, chr text,
               last_body text, last_from_char boolean, last_at timestamptz,
               total bigint, unseen bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return query
    select m.user_id, p.display_name, p.username, m.chr,
           (array_agg(m.body      order by m.created_at desc))[1],
           (array_agg(m.from_char order by m.created_at desc))[1],
           max(m.created_at),
           count(*),
           count(*) filter (where not m.from_char and not m.seen)
    from public.dm_messages m
    join public.profiles p on p.id = m.user_id
    group by m.user_id, p.display_name, p.username, m.chr
    order by max(m.created_at) desc;
end;
$function$;

REVOKE ALL ON FUNCTION public.dm_mark_seen(text, uuid), public.admin_dm_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_mark_seen(text, uuid), public.admin_dm_threads() TO authenticated;

-- 6. 權限：先全部收回，再只開需要的（訪客一律沒有）
REVOKE ALL ON public.dm_messages FROM anon, authenticated;
GRANT SELECT, DELETE ON public.dm_messages TO authenticated;
GRANT INSERT (user_id, chr, post, from_char, body) ON public.dm_messages TO authenticated;

COMMIT;
