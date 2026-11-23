-- 僅供 GitHub Actions 一次性 PostgreSQL 17 測試容器，不得套用正式資料庫。
-- auth.jwt/auth.uid 在本檔以測試 GUC 模擬；is_admin 使用正式 Supabase 2026-11-24 唯讀核對的原始判斷邏輯。
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('admin', 'reader'))
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('wb_test.uid', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$ SELECT coalesce(nullif(current_setting('wb_test.jwt', true), ''), '{}')::jsonb $$;

-- 以下採用正式 is_admin() 的相同權限判定，不再使用 wb_test.admin 布林值捷徑。
CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
     AND EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = (SELECT auth.uid()) AND role = 'admin');
$function$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
