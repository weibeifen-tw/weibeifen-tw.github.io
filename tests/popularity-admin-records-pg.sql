-- 僅在 GitHub Actions 臨時 PostgreSQL 17 測試環境執行
\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','reader');

DO $permissions$
BEGIN
  IF has_function_privilege('anon','public.admin_popularity_overview(integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.admin_popularity_overview(integer)','EXECUTE')
  OR has_table_privilege('authenticated','public.popularity_adjustment_log','SELECT')
  THEN RAISE EXCEPTION 'overview privilege leakage'; END IF;
END
$permissions$;

SELECT set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('wb_test.jwt','{"aal":"aal1"}',false);
DO $deny$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_popularity_overview(50);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AAL1 admin can read history'; END IF;
END
$deny$;

SELECT set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $deny$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_popularity_overview(50);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AAL2 reader can read history'; END IF;
END
$deny$;

SELECT set_config('wb_test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $allowed$
DECLARE data jsonb;
BEGIN
  PERFORM public.admin_set_popularity('yu',135);
  PERFORM public.admin_set_popularity('yu',210);
  data:=public.admin_popularity_overview(50);
  IF jsonb_array_length(data->'works')<>22 OR
     jsonb_array_length(data->'history')<>2 OR
     data->'history'->0->>'new_value'<>'210' OR
     data->'history'->1->>'new_value'<>'135'
  THEN RAISE EXCEPTION 'current values or history wrong'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(data->'works') x
     WHERE x->>'id'='yu' AND x->>'popularity'='210'
       AND x->>'configured'='true'
  ) THEN RAISE EXCEPTION 'current popularity mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(data->'works') x
     WHERE x->>'id'='lailu' AND x->>'configured'='true'
  ) THEN RAISE EXCEPTION 'unconfigured work marked configured'; END IF;
  IF jsonb_array_length((public.admin_popularity_overview(1))->'history')<>1
  THEN RAISE EXCEPTION 'history limit ignored'; END IF;
END
$allowed$;

SET ROLE authenticated;
SELECT set_config('wb_test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('wb_test.jwt','{"aal":"aal2"}',false);
DO $deny$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_popularity_overview(50);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='WB_NOT_ADMIN' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'reader direct RPC allowed'; END IF;
END
$deny$;
RESET ROLE;
SELECT 'popularity admin history integration checks passed' AS result;
