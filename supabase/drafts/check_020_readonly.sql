-- ============================================================================
-- 020_delete_account 是否已套用：唯讀核對（V1.0 S12，2026-11-22）
-- 只有 SELECT，不執行 delete_my_account()、不改任何東西。可直接在 SQL Editor 執行，結果整段傳給 Claude。
-- 注意：不要用「GitHub 有這個檔案」當作已部署的證據；以下面查詢結果為準。
-- ============================================================================
WITH f AS (
  SELECT p.oid, p.prosrc, p.prosecdef, p.proconfig, p.provolatile, pg_get_userbyid(p.proowner) AS owner,
         pg_get_function_result(p.oid) AS returns, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'delete_my_account'
)
SELECT
  (SELECT count(*) FROM f)                                                        AS "1_函式存在(應為1)",
  (SELECT returns FROM f)                                                         AS "2_回傳(應為void)",
  (SELECT lanname FROM f)                                                         AS "3_語言(應為plpgsql)",
  (SELECT prosecdef FROM f)                                                       AS "4_SECURITY_DEFINER(應為true)",
  (SELECT proconfig::text FROM f)                                                 AS "5_search_path(應為{search_path=\"\"})",
  (SELECT owner FROM f)                                                           AS "6_擁有者(應為postgres)",
  (SELECT md5(regexp_replace(prosrc, '\s+', '', 'g')) FROM f)                     AS "7_內容指紋",
  (SELECT md5(regexp_replace(prosrc, '\s+', '', 'g')) = '15031cb36d60df5f1a8bc98949919d42' FROM f) AS "8_與repo的020相同(應為true)",
  has_function_privilege('anon',          'public.delete_my_account()', 'EXECUTE') AS "9_anon可執行(應為false)",
  has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE') AS "10_會員可執行(應為true)",
  has_function_privilege('public',        'public.delete_my_account()', 'EXECUTE') AS "11_PUBLIC可執行(應為false)";
-- 若 1 是 0：020 尚未套用（第 2～11 欄會報錯或空白；那是正常的，代表不存在）。

-- 刪帳號會不會把會員資料一起刪掉：所有指向 auth.users／profiles 的外鍵與刪除規則（c＝CASCADE、a＝不處理、r＝禁止、n＝設為空）
SELECT conrelid::regclass AS 表, conname AS 外鍵, confrelid::regclass AS 指向, confdeltype AS 刪除規則
  FROM pg_constraint
 WHERE contype = 'f' AND confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
 ORDER BY 3, 1;
