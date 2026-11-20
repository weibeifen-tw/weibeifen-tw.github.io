-- 020：讀者自己刪除帳號
-- 刪除 auth.users 的那一列；個人資料、留言、私訊、收藏、書籤、閱讀進度、檢舉紀錄
-- 都設定了 ON DELETE CASCADE，會一起永久刪除。
-- 管理員不能刪自己（避免後台沒人管）；被封鎖的帳號不能刪（避免刪掉重來躲封鎖）。
-- 可以重複執行。

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'WB_NOT_LOGGED_IN';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin') THEN
    RAISE EXCEPTION 'WB_ADMIN_CANNOT_DELETE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE user_id = uid) THEN
    RAISE EXCEPTION 'WB_BANNED';
  END IF;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
