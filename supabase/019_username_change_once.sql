-- 《未備份》讀者的帳號名稱也只能改一次（跟顯示名稱、頭貼顏色一樣；簡介可以重複改）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- profiles 加一個欄位 username_changed_at，記錄什麼時候用掉那一次
--   * 前端沒有權限改這個欄位，只能由觸發器設定
--   * 已經設定過帳號名稱的會員，當作已經用掉那一次
--   * 管理員（user_roles admin）不受限制

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

UPDATE public.profiles
   SET username_changed_at = now()
 WHERE username IS NOT NULL AND username_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.profiles_change_once()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  admin boolean := exists (select 1 from public.user_roles where user_id = new.id and role = 'admin');
begin
  -- 這三個欄位只有觸發器能改
  new.name_changed_at     := old.name_changed_at;
  new.color_changed_at    := old.color_changed_at;
  new.username_changed_at := old.username_changed_at;
  if new.display_name is distinct from old.display_name and not admin then
    if old.name_changed_at is not null then
      raise exception 'WB_NAME_LOCKED';
    end if;
    new.name_changed_at := now();
  end if;
  if new.avatar_color is distinct from old.avatar_color and not admin then
    if old.color_changed_at is not null then
      raise exception 'WB_COLOR_LOCKED';
    end if;
    new.color_changed_at := now();
  end if;
  if new.username is distinct from old.username and not admin then
    if old.username_changed_at is not null then
      raise exception 'WB_USERNAME_LOCKED';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.profiles_change_once() FROM PUBLIC, anon, authenticated;

COMMIT;
