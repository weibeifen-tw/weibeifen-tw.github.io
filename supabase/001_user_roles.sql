-- 《未備份》會員角色表（管理員權限）
-- 在 Supabase → SQL Editor 貼上執行。這個檔案不會被發布到網站（_config.yml 已排除 supabase/）。
--
-- 設計：
--   * 一般讀者用 Google 登入後沒有任何一列 → 一般會員。
--   * 只有資料表裡 role = 'admin' 的人是管理員。
--   * 網頁（anon / authenticated）只能「讀自己那一列」，沒有任何新增、修改、刪除權限，
--     所以沒有人能從網頁把自己變成管理員；只有你在 Supabase 後台能加入。
--   * 之後任何管理功能的資料表，都在 RLS 裡用 public.is_admin() 判斷。

-- 第 1 步：建立資料表與權限（可以重複執行）
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists "read own role" on public.user_roles;
create policy "read own role"
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));
-- 刻意不建立 insert / update / delete policy：網頁端一律無法寫入。

-- 後端判斷用：目前登入者是不是管理員
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- 第 2 步：把你自己設為管理員（只執行一次）
-- 把下面的 <你的會員 ID> 換成 /member/ 或 /login-test/ 上顯示的「會員 ID」，再取消註解執行。
-- insert into public.user_roles (user_id, role) values ('<你的會員 ID>', 'admin')
--   on conflict (user_id) do update set role = excluded.role;


-- 檢查（可選）：列出所有管理員，應該只有你一個
-- select r.user_id, u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id;
