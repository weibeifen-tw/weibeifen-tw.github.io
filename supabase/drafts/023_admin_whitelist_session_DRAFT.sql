-- ============================================================================
-- 023 管理員固定白名單＋管理工作階段期限（FIX-01、FIX-06；D17–D21）— 草案，尚未執行
-- V1.0 S09（2026-11-22）。只能由站長在 Supabase SQL Editor 執行；執行前先匯出備份。
--
-- 相容性：is_admin() 名稱、參數、回傳值不變 → 002～021 所有呼叫它的函式與政策不用改。
-- 判斷（全部成立才是管理員）：
--   1. 目前登入者在 admin_whitelist（固定 UUID；表格對網頁端完全不可讀寫，UUID 不會出現在函式原始碼）
--   2. user_roles 有 admin（沿用）
--   3. JWT aal = aal2（沿用）
--   4. 絕對期限 8 小時：最近一次 TOTP／WebAuthn 驗證時間（JWT amr timestamp）在 8 小時內
--   5. 閒置 30 分鐘：admin_activity.last_seen 在 30 分鐘內，或 30 分鐘內剛完成 MFA
--      （後台每次操作呼叫 admin_touch() 更新；不靠前端計時器）
-- 未包含（需另行設計後再授權）：高風險操作 5 分鐘重新驗證＋與操作／資源綁定（見 FIX 計畫 FIX-06c）。
-- 一般會員登入政策不受影響（只影響 is_admin()）。
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_whitelist (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  note    text,
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;          -- 沒有任何政策＝網頁端全拒
REVOKE ALL ON TABLE public.admin_whitelist FROM PUBLIC, anon, authenticated;

-- 只放站長一人：從現有 user_roles 的 admin 帶入（不在檔案裡寫 UUID）。執行後請確認只有 1 列。
INSERT INTO public.admin_whitelist (user_id, note)
  SELECT user_id, 'V1.0 FIX-01 initial' FROM public.user_roles WHERE role = 'admin'
  ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_activity (
  user_id   uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_activity FROM PUBLIC, anon, authenticated;

-- 最近一次 MFA 驗證時間（epoch 秒）；沒有就 0
CREATE OR REPLACE FUNCTION public.admin_mfa_at()
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce(max((x ->> 'timestamp')::bigint), 0)
    FROM jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x
   WHERE x ->> 'method' IN ('totp', 'webauthn');
$function$;
REVOKE ALL ON FUNCTION public.admin_mfa_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT auth.jwt() ->> 'aal'), '') = 'aal2'
     AND EXISTS (SELECT 1 FROM public.admin_whitelist w WHERE w.user_id = (SELECT auth.uid()))
     AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin')
     AND public.admin_mfa_at() > extract(epoch FROM now())::bigint - 8 * 3600
     AND ( public.admin_mfa_at() > extract(epoch FROM now())::bigint - 30 * 60
           OR EXISTS (SELECT 1 FROM public.admin_activity a
                       WHERE a.user_id = (SELECT auth.uid()) AND a.last_seen > now() - interval '30 minutes') );
$function$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 後台每次操作時呼叫：只有目前仍是管理員才會更新（閒置超過 30 分鐘就要重新做兩步驟驗證）
CREATE OR REPLACE FUNCTION public.admin_touch()
 RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RETURN false; END IF;
  INSERT INTO public.admin_activity (user_id, last_seen) VALUES ((SELECT auth.uid()), now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen = excluded.last_seen;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_touch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_touch() TO authenticated;

COMMIT;

-- 驗證（T01、T02 對應）：
-- select count(*) from public.admin_whitelist;                    -- 應為 1
-- 用女友帳號（reader）登入呼叫 rpc('is_admin') → false；呼叫 rpc('admin_touch') → false
-- 站長 TOTP 後 → true；35 分鐘不操作 → false（需重新 TOTP）；8 小時後即使一直操作 → false
-- 復原：把 is_admin() 換回 schema_2026-11-20.sql 第 478–488 行的版本；admin_whitelist／admin_activity 可保留不用。
-- 前端配合（尚未做，等這份執行後再做）：assets/admin.js 每次載入分頁、送出操作前呼叫 rpc('admin_touch')，回 false 就導回會員頁重新驗證。
