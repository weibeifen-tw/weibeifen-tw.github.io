-- 只給 GitHub Actions 一次性 PostgreSQL 17 測試容器使用，絕不在正式 Supabase 執行。
-- 使用最小化 auth 模擬，不能替代正式 Auth/RLS 審查。
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('wb_test.uid', true), '')::uuid $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('wb_test.admin', true), '') = 'true' $$;
