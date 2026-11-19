-- 《未備份》個人簡介改成最多 30 個字
-- 在 Supabase → SQL Editor 整段貼上執行一次。整段包在交易裡，任何一行失敗就全部不生效。
--
-- 已經超過 30 個字的簡介會被截成前 30 個字（不然新的限制加不上去）。

BEGIN;

UPDATE public.profiles SET bio = left(bio, 30) WHERE char_length(bio) > 30;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_bio_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_len CHECK (bio IS NULL OR char_length(bio) <= 30);

COMMIT;
