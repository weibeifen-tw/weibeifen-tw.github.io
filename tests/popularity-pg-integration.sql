-- 僅針對測試容器中已套用的草案驗證 API 資料邏輯（不接正式資料）。
\set ON_ERROR_STOP on
SELECT set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','reader');
INSERT INTO public.popularity_works(work_id,is_public) VALUES ('yu',true),('draft',false);
INSERT INTO public.popularity_chapters(chapter_path,work_id,is_public)
  VALUES('/t/yu01/','yu',true),('/t/yu02/','yu',false);
-- 匿名者與一般會員不能直接執行寫入函式、不能讀取原始表格。
DO $$
BEGIN
  IF has_function_privilege('anon','public.popularity_record_view(uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.popularity_record_view(uuid,text,text,text)','EXECUTE')
     OR has_table_privilege('anon','public.popularity_view_events','SELECT')
     OR has_table_privilege('authenticated','public.popularity_work_totals','UPDATE')
  THEN RAISE EXCEPTION 'unexpected public or member privileges'; END IF;
END $$;
-- 第一次觀看記錄、章節歸屬、相同事件重試。
DO $$
DECLARE
  e uuid := '11111111-1111-4111-8111-111111111111';
  first boolean;
  retry boolean;
  total bigint;
  used integer;
BEGIN
  first := public.popularity_record_view(e,'yu',repeat('a',64),'/t/yu01/');
  retry := public.popularity_record_view(e,'yu',repeat('a',64),'/t/yu01/');
  SELECT total_views INTO total FROM public.popularity_work_totals WHERE work_id='yu';
  SELECT event_count INTO used FROM public.popularity_rate_buckets;
  IF first IS DISTINCT FROM true OR retry IS DISTINCT FROM false OR total <> 1 OR used <> 1
  THEN RAISE EXCEPTION 'idempotency or rate bucket failed'; END IF;
END $$;
-- 30 次／分鐘上限（測試假設），超限不能改變事件與累積真實觀看。
DO $$
DECLARE
  i integer;
  before_count bigint;
  after_count bigint;
  denied boolean := false;
  n int;
BEGIN
  FOR i IN 2..30 LOOP
    PERFORM public.popularity_record_view(md5(i::text)::uuid, 'yu',repeat('a',64),NULL);
  END LOOP;
  SELECT total_views INTO before_count FROM public.popularity_work_totals WHERE work_id='yu';
  BEGIN
    PERFORM public.popularity_record_view('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
      'yu',repeat('a',64),NULL);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'WB_RATE_LIMITED' THEN denied := true; ELSE RAISE; END IF;
  END;
  SELECT total_views INTO after_count FROM public.popularity_work_totals WHERE work_id='yu';
  SELECT count(*) INTO n FROM public.popularity_view_events;
  IF before_count <> 30 OR NOT denied OR after_count <> 30 OR n <> 30
  THEN RAISE EXCEPTION 'rate-limit rollback or aggregation failed: before %, after %, events %',
    before_count,after_count,n;
  END IF;
END $$;
-- 草稿未公開作品與非公開章節不能計數。
DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.popularity_record_view('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
      'draft',repeat('b',64),NULL);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_UNPUBLISHED_WORK' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'unpublished work was counted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.popularity_record_view('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      'yu',repeat('b',64),'/t/yu02/');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_INVALID_CHAPTER_OWNERSHIP' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'unpublished chapter was counted'; END IF;
END $$;
-- 使用正式 is_admin() 等效邏輯驗證：AAL1 管理員／AAL2 一般會員皆不可調整。
DO $
DECLARE
  denied boolean;
BEGIN
  PERFORM set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
  PERFORM set_config('wb_test.jwt','{"aal":"aal1"}',false);
  IF public.is_admin() THEN RAISE EXCEPTION 'AAL1 admin was accepted'; END IF;
  denied := false;
  BEGIN
    PERFORM public.admin_set_popularity('yu',200);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AAL1 admin modified popularity'; END IF;

  PERFORM set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
  PERFORM set_config('wb_test.jwt','{"aal":"aal2"}',false);
  IF public.is_admin() THEN RAISE EXCEPTION 'AAL2 reader was accepted'; END IF;
  denied := false;
  BEGIN
    PERFORM public.admin_set_popularity('yu',200);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AAL2 reader modified popularity'; END IF;

  PERFORM set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
  PERFORM set_config('wb_test.jwt','{"aal":"aal2"}',false);
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'AAL2 admin was rejected'; END IF;
  PERFORM public.admin_set_popularity('yu',200);
  IF (SELECT base_popularity FROM public.popularity_baselines WHERE work_id='yu') <> 200
  OR (SELECT baseline_views FROM public.popularity_baselines WHERE work_id='yu') <> 30
  OR (SELECT count(*) FROM public.popularity_adjustment_log) <> 1
  THEN RAISE EXCEPTION 'admin baseline or audit mismatch'; END IF;
END $;

-- 模擬已登入角色實際呼叫 RPC（不是只做 has_function_privilege 目錄檢查）。
SET ROLE authenticated;
SELECT set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $
DECLARE denied boolean:=false;
BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'reader elevated via role'; END IF;
  BEGIN
    PERFORM public.admin_set_popularity('yu',900);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated reader bypassed role guard'; END IF;
END $;
RESET ROLE;
SELECT 'isolated draft PostgreSQL checks passed' AS result;
