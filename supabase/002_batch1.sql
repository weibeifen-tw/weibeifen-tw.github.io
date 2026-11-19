-- 《未備份》會員系統第一批：會員資料（RLS）＋管理員權限（需兩步驟驗證）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 前提（2026-11-20 已在後台完成並核對）：
--   * 前端角色對 profiles / user_roles 只保留必要權限，TRUNCATE 已收回
--   * profiles 只能改 username / display_name / avatar_url / bio，且只能改自己的
--   * is_admin() 已建立，rls_auto_enable() 已不給前端執行
--
-- 這一批做的事：
--   1. 新會員不再自動帶入 Google 本名與大頭貼，一律顯示「新會員」
--   2. 既有會員的顯示名稱重設為「新會員」、清掉 Google 大頭貼（登入後可自己改名）
--   3. 前端不能改大頭貼網址（避免放外部追蹤圖），之後若開放頭像再另外設計
--   4. 個人資料加上格式限制，資料庫端擋，不只靠網頁
--   5. updated_at 自動更新
--   6. is_admin()：必須是 admin，而且「這次登入有輸入過兩步驟驗證碼」（aal2）才算

BEGIN;

-- 1. 註冊時建立的公開資料：不帶入 Google 本名與大頭貼
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, '新會員', null);

  insert into public.user_roles (user_id, role)
  values (new.id, 'reader');

  return new;
end;
$function$;

-- 2. 既有會員重設
UPDATE public.profiles SET display_name = '新會員', avatar_url = NULL;

-- 3. 前端不能改大頭貼網址
REVOKE UPDATE (avatar_url) ON public.profiles FROM authenticated;

-- 4. 格式限制
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 30),
  ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'),
  ADD CONSTRAINT profiles_bio_len
    CHECK (bio IS NULL OR char_length(bio) <= 200);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_uniq ON public.profiles (username);

-- 5. updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. 管理員必須通過兩步驟驗證
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
     );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;
