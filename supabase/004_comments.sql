-- 《未備份》會員系統第三批：公開留言
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 設計：
--   * 所有人（含訪客）都看得到留言；只有登入會員能留言
--   * 不能編輯留言；自己可以刪自己的，管理員（已通過兩步驟驗證）可以刪任何一則
--   * 防洗版：同一人 15 秒內只能留 1 則、1 小時最多 5 則（資料庫端擋）
--   * 檢舉：每人對同一則只能檢舉一次；被 3 個不同會員檢舉 → 自動隱藏
--     隱藏的留言只有作者本人和管理員看得到；管理員可以刪除或恢復
--   * 正規表示式不使用超過 255 的重複次數，長度一律用 char_length 檢查

BEGIN;

-- 1. 留言
CREATE TABLE public.comments (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE CASCADE,
  novel      text NOT NULL CHECK (novel ~ '^[a-z0-9_-]{1,40}$'),
  path       text NOT NULL CHECK (path ~ '^/[^/\s][^\s]*$' AND char_length(path) <= 300),
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  hidden     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_path_idx ON public.comments (path, created_at);
CREATE INDEX comments_user_idx ON public.comments (user_id, created_at);

-- 2. 檢舉
CREATE TABLE public.comment_reports (
  comment_id bigint NOT NULL REFERENCES public.comments (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  reason     text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- 3. 新增留言前：固定作者、時間、未隱藏，並檢查發文頻率
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
REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER comments_before_insert
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_before_insert();

-- 4. 檢舉後：滿 3 個不同會員就自動隱藏
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
$function$;
REVOKE ALL ON FUNCTION public.comment_reports_after_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER comment_reports_after_insert
  AFTER INSERT ON public.comment_reports
  FOR EACH ROW EXECUTE FUNCTION public.comment_reports_after_insert();

-- 5. RLS
ALTER TABLE public.comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- 讀：訪客只看到沒被隱藏的；會員另外看得到自己的；管理員看得到全部
CREATE POLICY "comments public read" ON public.comments FOR SELECT TO anon
  USING (NOT hidden);
CREATE POLICY "comments member read" ON public.comments FOR SELECT TO authenticated
  USING (NOT hidden OR (SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));
-- 寫：只能用自己的身分
CREATE POLICY "comments insert own" ON public.comments FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
-- 刪：自己的，或管理員
CREATE POLICY "comments delete own or admin" ON public.comments FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));
-- 改：只有管理員（恢復被隱藏的留言）
CREATE POLICY "comments admin update" ON public.comments FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "reports insert own" ON public.comment_reports FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "reports read own or admin" ON public.comment_reports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));
CREATE POLICY "reports admin delete" ON public.comment_reports FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 6. 權限：先全部收回，再只開需要的
REVOKE ALL ON public.comments, public.comment_reports FROM anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT (novel, path, body) ON public.comments TO authenticated;
GRANT DELETE ON public.comments TO authenticated;
GRANT UPDATE (hidden) ON public.comments TO authenticated;
GRANT SELECT, DELETE ON public.comment_reports TO authenticated;
GRANT INSERT (comment_id, reason) ON public.comment_reports TO authenticated;

COMMIT;
