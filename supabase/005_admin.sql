-- 《未備份》會員系統第四批：管理後台（/admin/）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 兩個只給管理員用的函式（必須 admin＋這次登入已通過兩步驟驗證，否則直接拒絕）：
--   * admin_stats()：會員數、留言數、每本小說被收藏幾次／幾人在讀（只有總數，不會列出是誰）
--   * admin_member_list()：會員列表（顯示名稱、帳號名稱、角色、加入時間、留言數；不含 email）
-- 留言管理沿用第三批的 RLS：管理員本來就能讀全部留言與檢舉、刪除、恢復、清除檢舉。

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_member_list()
RETURNS TABLE (id uuid, display_name text, username text, role text, created_at timestamptz, comments bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
$function$;

REVOKE ALL ON FUNCTION public.admin_stats(), public.admin_member_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stats(), public.admin_member_list() TO authenticated;

COMMIT;
