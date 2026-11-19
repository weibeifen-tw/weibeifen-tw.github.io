-- 《未備份》資料庫完整存檔（public schema）
-- 產生時間：2026-11-20 03:28（台北）
-- 由 supabase/export_schema.sql 從實際資料庫產生。只有結構與權限，沒有資料。
-- 順序：資料表 → 限制 → 索引 → 函式 → 觸發器 → 事件觸發器 → RLS → 政策 → 權限；在全新的 Supabase 專案可整段執行重建。

BEGIN;

CREATE TABLE public.comment_reports (
  comment_id bigint NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.comments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  novel text NOT NULL,
  path text NOT NULL,
  body text NOT NULL,
  hidden boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  removed boolean DEFAULT false NOT NULL
);

CREATE TABLE public.dm_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  chr text NOT NULL,
  post text,
  from_char boolean DEFAULT false NOT NULL,
  body text NOT NULL,
  seen boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.favorites (
  user_id uuid NOT NULL,
  novel text NOT NULL,
  path text DEFAULT ''::text NOT NULL,
  title text,
  no text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reading_progress (
  user_id uuid NOT NULL,
  k text NOT NULL,
  url text NOT NULL,
  no text,
  title text,
  chr text,
  t bigint DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text DEFAULT 'reader'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.comment_reports ADD CONSTRAINT comment_reports_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE public.comment_reports ADD CONSTRAINT comment_reports_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 200)));

ALTER TABLE public.comments ADD CONSTRAINT comments_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));

ALTER TABLE public.comments ADD CONSTRAINT comments_novel_check CHECK ((novel ~ '^[a-z0-9_-]{1,40}$'::text));

ALTER TABLE public.comments ADD CONSTRAINT comments_path_check CHECK (((path ~ '^/[^/\s][^\s]*$'::text) AND (char_length(path) <= 300)));

ALTER TABLE public.comments ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_chr_check CHECK ((chr ~ '^[a-z0-9_-]{1,40}$'::text));

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_post_check CHECK (((post IS NULL) OR (post ~ '^[a-z0-9_-]{1,80}$'::text)));

ALTER TABLE public.favorites ADD CONSTRAINT favorites_no_check CHECK (((no IS NULL) OR (char_length(no) <= 10)));

ALTER TABLE public.favorites ADD CONSTRAINT favorites_novel_check CHECK ((novel ~ '^[a-z0-9_-]{1,40}$'::text));

ALTER TABLE public.favorites ADD CONSTRAINT favorites_path_check CHECK (((path = ''::text) OR ((path ~ '^/[^/\s][^\s]*$'::text) AND (char_length(path) <= 300))));

ALTER TABLE public.favorites ADD CONSTRAINT favorites_pkey PRIMARY KEY (user_id, novel, path);

ALTER TABLE public.favorites ADD CONSTRAINT favorites_title_check CHECK (((title IS NULL) OR (char_length(title) <= 100)));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_len CHECK (((bio IS NULL) OR (char_length(bio) <= 200)));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_len CHECK (((display_name IS NULL) OR ((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 30))));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format CHECK (((username IS NULL) OR (username ~ '^[a-z0-9_]{3,20}$'::text)));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_chr_check CHECK (((chr IS NULL) OR (char_length(chr) <= 40)));

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_k_check CHECK ((k ~ '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$'::text));

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_no_check CHECK (((no IS NULL) OR (char_length(no) <= 10)));

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_pkey PRIMARY KEY (user_id, k);

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_title_check CHECK (((title IS NULL) OR (char_length(title) <= 100)));

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_url_check CHECK (((url ~ '^/[^/\s][^\s]*$'::text) AND (char_length(url) <= 300)));

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['reader'::text, 'admin'::text])));

ALTER TABLE public.comment_reports ADD CONSTRAINT comment_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;

ALTER TABLE public.comment_reports ADD CONSTRAINT comment_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX comments_path_idx ON public.comments USING btree (path, created_at);

CREATE INDEX comments_user_idx ON public.comments USING btree (user_id, created_at);

CREATE INDEX dm_messages_thread_idx ON public.dm_messages USING btree (user_id, chr, created_at);

CREATE INDEX dm_messages_unseen_idx ON public.dm_messages USING btree (user_id, from_char) WHERE (NOT seen);

CREATE UNIQUE INDEX profiles_username_uniq ON public.profiles USING btree (username);

CREATE OR REPLACE FUNCTION public.admin_dm_threads()
 RETURNS TABLE(user_id uuid, display_name text, username text, chr text, last_body text, last_from_char boolean, last_at timestamp with time zone, total bigint, unseen bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_member_list()
 RETURNS TABLE(id uuid, display_name text, username text, role text, created_at timestamp with time zone, comments bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return query
    select p.id, p.display_name, p.username, coalesce(r.role, 'reader'), p.created_at,
           (select count(*) from public.comments c where c.user_id = p.id)
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    order by p.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return jsonb_build_object(
    'members',        (select count(*) from public.profiles),
    'members_7d',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'comments',       (select count(*) from public.comments),
    'comments_7d',    (select count(*) from public.comments where created_at > now() - interval '7 days'),
    'hidden',         (select count(*) from public.comments where hidden),
    'reported',       (select count(distinct comment_id) from public.comment_reports),
    'novels', coalesce((
      select jsonb_agg(jsonb_build_object('novel', n, 'fav', fav, 'marks', marks, 'readers', readers, 'comments', cm) order by fav desc, readers desc)
      from (
        select n,
          (select count(*) from public.favorites f where f.novel = n and f.path = '') as fav,
          (select count(*) from public.favorites f where f.novel = n and f.path <> '') as marks,
          (select count(distinct user_id) from public.reading_progress r where split_part(r.k, ':', 1) = n) as readers,
          (select count(*) from public.comments c where c.novel = n) as cm
        from (
          select novel as n from public.favorites
          union select split_part(k, ':', 1) from public.reading_progress
          union select novel from public.comments
        ) ids
      ) t
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.comment_reports_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select count(*) from public.comment_reports where comment_id = new.comment_id) >= 3 then
    update public.comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.comments_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.user_id := auth.uid(); new.created_at := now();
  new.hidden := false; new.removed := false; new.body := btrim(new.body);
  if new.user_id is null then raise exception 'WB_LOGIN_REQUIRED'; end if;
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '15 seconds') then
    raise exception 'WB_TOO_FAST'; end if;
  if (select count(*) from public.comments where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'WB_TOO_MANY'; end if;
  return new;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.dm_mark_seen(p_chr text, p_user uuid DEFAULT NULL::uuid)
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, display_name, avatar_url) values (new.id, '新會員', null);
  insert into public.user_roles (user_id, role) values (new.id, 'reader');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
     AND EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = (SELECT auth.uid()) AND role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.updated_at := now(); return new; end; $function$
;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER comment_reports_after_insert AFTER INSERT ON public.comment_reports FOR EACH ROW EXECUTE FUNCTION comment_reports_after_insert();

CREATE TRIGGER comments_before_insert BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION comments_before_insert();

CREATE TRIGGER dm_before_insert BEFORE INSERT ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION dm_before_insert();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reading_progress_set_updated_at BEFORE UPDATE ON public.reading_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports admin delete" ON public.comment_reports AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT is_admin() AS is_admin));

CREATE POLICY "reports insert own" ON public.comment_reports AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "reports read own or admin" ON public.comment_reports AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_admin() AS is_admin)));

CREATE POLICY "comments admin update" ON public.comments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));

CREATE POLICY "comments delete own or admin" ON public.comments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_admin() AS is_admin)));

CREATE POLICY "comments insert own" ON public.comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "comments member read" ON public.comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((NOT removed) AND ((NOT hidden) OR (( SELECT auth.uid() AS uid) = user_id))) OR ( SELECT is_admin() AS is_admin)));

CREATE POLICY "comments public read" ON public.comments AS PERMISSIVE FOR SELECT TO anon
  USING (((NOT hidden) AND (NOT removed)));

CREATE POLICY "dm admin delete" ON public.dm_messages AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT is_admin() AS is_admin));

CREATE POLICY "dm insert own or admin" ON public.dm_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((( SELECT auth.uid() AS uid) = user_id) AND (NOT from_char)) OR ( SELECT is_admin() AS is_admin)));

CREATE POLICY "dm read own or admin" ON public.dm_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_admin() AS is_admin)));

CREATE POLICY "own favorites delete" ON public.favorites AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "own favorites insert" ON public.favorites AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "own favorites select" ON public.favorites AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Public profiles are viewable" ON public.profiles AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "own progress insert" ON public.reading_progress AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "own progress select" ON public.reading_progress AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "own progress update" ON public.reading_progress AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can view own role" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

REVOKE ALL ON public.comment_reports FROM anon, authenticated;

GRANT DELETE, SELECT ON public.comment_reports TO authenticated;

GRANT INSERT (comment_id, reason) ON public.comment_reports TO authenticated;

REVOKE ALL ON public.comments FROM anon, authenticated;

GRANT SELECT ON public.comments TO anon;

GRANT DELETE, SELECT ON public.comments TO authenticated;

GRANT INSERT (body, novel, path) ON public.comments TO authenticated;

GRANT UPDATE (hidden, removed) ON public.comments TO authenticated;

REVOKE ALL ON public.dm_messages FROM anon, authenticated;

GRANT DELETE, SELECT ON public.dm_messages TO authenticated;

GRANT INSERT (body, chr, from_char, post, user_id) ON public.dm_messages TO authenticated;

REVOKE ALL ON public.favorites FROM anon, authenticated;

GRANT DELETE, INSERT, SELECT ON public.favorites TO authenticated;

REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT ON public.profiles TO anon;

GRANT SELECT ON public.profiles TO authenticated;

GRANT UPDATE (bio, display_name, username) ON public.profiles TO authenticated;

REVOKE ALL ON public.reading_progress FROM anon, authenticated;

GRANT INSERT, SELECT, UPDATE ON public.reading_progress TO authenticated;

REVOKE ALL ON public.user_roles FROM anon, authenticated;

GRANT SELECT ON public.user_roles TO authenticated;

REVOKE ALL ON FUNCTION public.admin_dm_threads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dm_threads() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_member_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_list() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.comment_reports_after_insert() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dm_before_insert() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dm_mark_seen(p_chr text, p_user uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dm_mark_seen(p_chr text, p_user uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
