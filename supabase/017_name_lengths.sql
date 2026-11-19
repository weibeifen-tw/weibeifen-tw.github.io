-- 《未備份》顯示名稱最多 5 個字、帳號名稱最多 8 個字
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 既有資料：
--   * 顯示名稱超過 5 個字 → 截成前 5 個字
--   * 帳號名稱超過 8 個字 → 清空（截短可能跟別人重複），讀者再自己設定一次
--   這次整理不算讀者「改過一次」（暫時關掉 016 的觸發器）

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_change_once') THEN
    ALTER TABLE public.profiles DISABLE TRIGGER profiles_change_once;
  END IF;
END $$;

UPDATE public.profiles SET display_name = left(btrim(display_name), 5)
  WHERE display_name IS NOT NULL AND char_length(btrim(display_name)) > 5;
UPDATE public.profiles SET username = NULL
  WHERE username IS NOT NULL AND char_length(username) > 8;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_change_once') THEN
    ALTER TABLE public.profiles ENABLE TRIGGER profiles_change_once;
  END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_display_name_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_len
  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 5);

ALTER TABLE public.profiles DROP CONSTRAINT profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,8}$');

COMMIT;
