-- 《未備份》人氣第一階段【緊急回滾候選】，平時不得執行。
-- 警告：執行本檔會永久刪除本次人氣設定及稽核紀錄！
-- 必須先由站長下載單獨備份並確認沒有第二階段表或資料依賴。
-- 不是自動回滾；不得在正常部署中執行。
BEGIN;
DO $gate$
BEGIN
  IF to_regclass('public.popularity_view_events') IS NOT NULL
     OR to_regclass('public.popularity_chapters') IS NOT NULL
     OR to_regclass('public.popularity_rate_buckets') IS NOT NULL
  THEN RAISE EXCEPTION 'WB_PHASE2_OBJECTS_EXIST_ABORT_ROLLBACK'; END IF;
END
$gate$;
DROP FUNCTION IF EXISTS public.admin_set_popularity(text,bigint);
DROP FUNCTION IF EXISTS public.popularity_publish_snapshot(timestamptz);
DROP FUNCTION IF EXISTS public.popularity_snapshot_read();
DROP TABLE IF EXISTS public.popularity_adjustment_log;
DROP TABLE IF EXISTS public.popularity_baselines;
DROP TABLE IF EXISTS public.popularity_public_snapshot;
DROP TABLE IF EXISTS public.popularity_work_totals;
DROP TABLE IF EXISTS public.popularity_works;
COMMIT;
