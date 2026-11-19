-- 《未備份》讀者的顯示名稱、頭貼顏色只能各改一次（簡介、帳號名稱可以重複改）
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- profiles 加兩個欄位，記錄什麼時候用掉那一次：name_changed_at、color_changed_at
--   * 前端沒有權限改這兩個欄位，只能由觸發器設定
--   * 從現在開始算：既有會員（包括已經改過名字的）都還有一次機會
--   * 管理員（user_roles admin，不需要兩步驟驗證）不受限制

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN name_changed_at  timestamptz,
  ADD COLUMN color_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.profiles_change_once()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  admin boolean := exists (select 1 from public.user_roles where user_id = new.id and role = 'admin');
begin
  -- 這兩個欄位只有觸發器能改
  new.name_changed_at  := old.name_changed_at;
  new.color_changed_at := old.color_changed_at;
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
  return new;
end;
$function$;
REVOKE ALL ON FUNCTION public.profiles_change_once() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_change_once ON public.profiles;
CREATE TRIGGER profiles_change_once
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_change_once();

COMMIT;
