-- 《未備份》管理後台：匯出全部資料（備份用）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- admin_export()：只有管理員（admin＋這次登入已通過兩步驟驗證）能執行，否則直接拒絕。
-- 回傳一個 JSON，包含所有 public 資料表的內容：
--   會員公開資料（含角色）、收藏、閱讀進度、留言、檢舉、私訊。
-- 不包含 email、Google 帳號資料、登入紀錄（那些在 auth schema，網站本來就不碰）。
-- 只讀，不會改任何資料。

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_export()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then
    raise exception 'WB_NOT_ADMIN';
  end if;
  return jsonb_build_object(
    'site',        '未備份',
    'version',     1,
    'exported_at', now(),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('role', coalesce(r.role, 'reader')) order by p.created_at)
      from public.profiles p left join public.user_roles r on r.user_id = p.id), '[]'::jsonb),
    'favorites',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.favorites t), '[]'::jsonb),
    'reading_progress', coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at) from public.reading_progress t), '[]'::jsonb),
    'comments',         coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.comments t), '[]'::jsonb),
    'comment_reports',  coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.comment_reports t), '[]'::jsonb),
    'dm_messages',      coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.dm_messages t), '[]'::jsonb)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.admin_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export() TO authenticated;

COMMIT;
