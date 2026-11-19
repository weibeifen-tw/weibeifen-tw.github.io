-- 《未備份》留言最多 100 個字
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 只在「新增留言」時檢查（觸發器），已經超過 100 字的舊留言保留不動，
-- 管理員刪除／恢復舊留言也不受影響。資料表本身的上限維持 500。私訊維持 500 字。

BEGIN;

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
  new.removed    := false;
  new.body       := btrim(new.body);
  if new.user_id is null then
    raise exception 'WB_LOGIN_REQUIRED';
  end if;
  if exists (select 1 from public.banned_users where user_id = new.user_id) then
    raise exception 'WB_BANNED';
  end if;
  if char_length(new.body) > 100 then
    raise exception 'WB_TOO_LONG';
  end if;
  new.as_author  := exists (select 1 from public.user_roles
                            where user_id = new.user_id and role = 'admin');
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

COMMIT;
