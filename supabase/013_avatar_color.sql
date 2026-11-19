-- 《未備份》會員頭貼：白底圓圈＋名字第一個字，字的顏色由會員自己選（管理員顯示 MU）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- profiles.avatar_color：顏色代號（red、blue…），只存代號、不存網址或色碼；NULL＝還沒選（網站依會員 ID 給一個預設色）
-- 會員只能改自己的（沿用 "Users can update own profile" 政策；被封鎖的人不能改）
-- admin_member_list() 多回傳 avatar_color（回傳欄位變了，所以先刪掉再重建）

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN avatar_color text CHECK (avatar_color IS NULL OR avatar_color ~ '^[a-z]{1,12}$');

GRANT UPDATE (avatar_color) ON public.profiles TO authenticated;

DROP FUNCTION public.admin_member_list();
CREATE FUNCTION public.admin_member_list()
RETURNS TABLE (id uuid, display_name text, username text, role text, created_at timestamptz,
               comments bigint, banned boolean, ban_reason text, avatar_color text)
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
           (b.user_id is not null), b.reason, p.avatar_color
    from public.profiles p
    left join public.user_roles r on r.user_id = p.id
    left join public.banned_users b on b.user_id = p.id
    order by p.created_at desc;
end;
$function$;
REVOKE ALL ON FUNCTION public.admin_member_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_member_list() TO authenticated;

COMMIT;
