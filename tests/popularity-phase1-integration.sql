-- 《未備份》第一階段：只在一次性 PostgreSQL 17 中執行，不接正式 Supabase。
\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','reader');

DO $check$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.popularity_works;
  IF n<>22 THEN RAISE EXCEPTION 'seed count %, expected 22',n; END IF;
  SELECT count(*) INTO n FROM public.popularity_public_snapshot;
  IF n<>0 THEN RAISE EXCEPTION 'must not publish fake initial popularity'; END IF;
  IF has_table_privilege('anon','public.popularity_baselines','SELECT')
  OR has_table_privilege('authenticated','public.popularity_adjustment_log','SELECT')
  OR has_table_privilege('anon','public.popularity_work_totals','UPDATE')
  OR has_function_privilege('anon','public.admin_set_popularity(text,bigint)','EXECUTE')
  OR has_function_privilege('authenticated','public.popularity_publish_snapshot(timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'unsafe permissions'; END IF;
  IF NOT has_function_privilege('anon','public.popularity_snapshot_read()','EXECUTE')
  THEN RAISE EXCEPTION 'public snapshot not readable'; END IF;
END
$check$;

-- AAL1 管理員、AAL2 一般會員都不得調整人氣。
DO $authcheck$
DECLARE blocked boolean;
BEGIN
  PERFORM set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
  PERFORM set_config('wb_test.jwt','{"aal":"aal1"}',false);
  blocked:=false;
  BEGIN
    PERFORM public.admin_set_popularity('yu',100);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'AAL1 admin unexpectedly allowed'; END IF;

  PERFORM set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
  PERFORM set_config('wb_test.jwt','{"aal":"aal2"}',false);
  blocked:=false;
  BEGIN
    PERFORM public.admin_set_popularity('yu',100);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'reader unexpectedly allowed'; END IF;
END
$authcheck$;

-- 使用經模擬但與正式 Supabase 同邏輯的 MFA 管理員身分進行設定。
SELECT set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $publishcheck$
DECLARE
  v_result jsonb;
  v_payload jsonb;
  v_top jsonb;
  v_count integer;
BEGIN
  v_result:=public.admin_set_popularity('yu',205);
  v_payload:=public.popularity_snapshot_read();
  SELECT value INTO v_top FROM jsonb_array_elements(v_payload->'works') LIMIT 1;
  IF v_result->>'work_id'<>'yu' OR
     (v_top->>'popularity')::bigint<>205 OR v_top->>'id'<>'yu' THEN
    RAISE EXCEPTION 'setting did not publish correct rank';
  END IF;
  IF jsonb_array_length(v_payload->'works')<>22 OR
    (SELECT count(*) FROM public.popularity_adjustment_log)<>1 THEN
    RAISE EXCEPTION 'snapshot count or audit mismatch'; END IF;
  IF (SELECT base_popularity FROM public.popularity_baselines WHERE work_id='yu')<>205
  THEN RAISE EXCEPTION 'wrong baseline'; END IF;

  PERFORM public.admin_set_popularity('yu',99);
  v_payload:=public.popularity_snapshot_read();
  SELECT (value->>'popularity')::bigint INTO v_count
    FROM jsonb_array_elements(v_payload->'works') WHERE value->>'id'='yu';
  IF v_count<>99 OR (SELECT count(*) FROM public.popularity_adjustment_log)<>2
  THEN RAISE EXCEPTION 'second baseline not reflected'; END IF;
END
$publishcheck$;

SET ROLE authenticated;
SELECT set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $rolecheck$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    PERFORM public.admin_set_popularity('yu',500);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'authenticated reader bypassed admin guard'; END IF;
  IF public.popularity_snapshot_read() IS NULL
    THEN RAISE EXCEPTION 'member cannot read snapshot'; END IF;
END
$rolecheck$;
RESET ROLE;

SELECT 'phase1 isolated database tests passed' AS result;
