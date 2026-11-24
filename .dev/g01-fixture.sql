-- Disposable PostgreSQL only, synthetic accounts. Not a Supabase/JWT end-to-end test.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,username text UNIQUE,display_name text,avatar_url text,avatar_color text,bio text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),name_changed_at timestamptz,color_changed_at timestamptz,username_changed_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE TABLE public.banned_users(user_id uuid);
CREATE FUNCTION public.is_banned() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM public.banned_users WHERE user_id=auth.uid()) $$;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id AND NOT public.is_banned() AND (coalesce(avatar_color,'')<>'orange' OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin')));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.profiles TO anon,authenticated;
GRANT UPDATE(display_name,username,bio,avatar_color) ON public.profiles TO authenticated;
CREATE TABLE public.comments(id int PRIMARY KEY,user_id uuid REFERENCES public.profiles(id),body text);
GRANT SELECT ON public.comments TO anon,authenticated;
