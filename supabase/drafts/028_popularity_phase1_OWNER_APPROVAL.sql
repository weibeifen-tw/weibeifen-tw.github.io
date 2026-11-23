-- 《未備份》人氣後端「第一階段」正式安裝候選（站長手動執行）
-- 已核對 2026-11-24 GitHub main:_data/novels.yml 22 部作品。
-- 僅包含公開人氣快照、管理員基準與稽核；不啟用匿名計數、Cron、Edge。
-- 注意：整份一次在 Supabase SQL Editor 執行；失敗會在 BEGIN/COMMIT 交易回滾。
-- 上線前須完成 GitHub Actions PostgreSQL 17 隔離測試、站長確認正式備份。
BEGIN;

-- 強制拒絕覆蓋已部署的同名物件（避免踩到未察覺的版本）
DO $preflight$
BEGIN
  IF to_regclass('public.popularity_works') IS NOT NULL
    OR to_regclass('public.popularity_work_totals') IS NOT NULL
    OR to_regclass('public.popularity_baselines') IS NOT NULL
    OR to_regclass('public.popularity_adjustment_log') IS NOT NULL
    OR to_regclass('public.popularity_public_snapshot') IS NOT NULL
  THEN RAISE EXCEPTION 'WB_PHASE1_ALREADY_INSTALLED'; END IF;
END
$preflight$;

CREATE TABLE public.popularity_works (
  work_id text PRIMARY KEY CHECK (work_id ~ '^[a-z0-9_-]{1,40}$'),
  is_public boolean NOT NULL DEFAULT false,
  sort_key integer NOT NULL DEFAULT 0
);
CREATE TABLE public.popularity_work_totals (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.popularity_baselines (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  base_popularity bigint NOT NULL DEFAULT 0 CHECK (base_popularity BETWEEN 0 AND 1000000000),
  baseline_views bigint NOT NULL DEFAULT 0 CHECK (baseline_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.popularity_adjustment_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  old_base bigint,
  old_baseline bigint,
  new_base bigint NOT NULL,
  new_baseline bigint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.popularity_public_snapshot (
  singleton integer PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  snapshot_version text NOT NULL,
  cutoff_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

-- 全部資料表啟用 RLS，拒絕一般訪客／會員直接讀寫原始人氣或紀錄。
ALTER TABLE public.popularity_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_work_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_adjustment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_public_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.popularity_works, public.popularity_work_totals,
  public.popularity_baselines, public.popularity_adjustment_log,
  public.popularity_public_snapshot FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.popularity_adjustment_log_id_seq
  FROM PUBLIC, anon, authenticated;

-- 只根據 GitHub main 首頁目前列出的 22 部作品建立對照，不推算任何觀看次數。
INSERT INTO public.popularity_works(work_id,is_public,sort_key) VALUES
    ('yu', true, 1),
    ('lailu', true, 2),
    ('market', true, 3),
    ('feichang', true, 4),
    ('gongdi', true, 5),
    ('hongdian', true, 6),
    ('hue', true, 7),
    ('exam', true, 8),
    ('yincang', true, 9),
    ('shiyi', true, 10),
    ('chaojian', true, 11),
    ('weigongkai', true, 12),
    ('chuwang', true, 13),
    ('mizi', true, 14),
    ('pendi', true, 15),
    ('shuangshuang', true, 16),
    ('duanqiao', true, 17),
    ('huaji', true, 18),
    ('xiwei', true, 19),
    ('chaosheng', true, 20),
    ('houdiao', true, 21),
    ('shanhai', true, 22);

-- 原子公開快照，依真實累積 + 管理員基準計算；同分延續上一份相對排序。
-- 只供受信任的 service_role 與安全的管理員函式在 DB 內呼叫。
CREATE FUNCTION public.popularity_publish_snapshot(p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $snapshot$
DECLARE
  v_previous jsonb;
  v_works jsonb;
  v_order jsonb;
  v_payload jsonb;
  v_version text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(982413, 100);
  IF p_cutoff IS NULL OR p_cutoff > now() + interval '5 minutes'
    OR p_cutoff < now() - interval '3 days' THEN
    RAISE EXCEPTION 'WB_INVALID_SNAPSHOT_CUTOFF';
  END IF;

  SELECT payload INTO v_previous
    FROM public.popularity_public_snapshot WHERE singleton = 1 FOR UPDATE;

  WITH old_positions AS (
    SELECT e.value AS work_id, e.ordinality AS old_rank
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(v_previous->'previous_order') = 'array'
           THEN v_previous->'previous_order' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(value, ordinality)
  ), calculated AS (
    SELECT w.work_id id,
       greatest(0, coalesce(b.base_popularity, 0) +
         coalesce(t.total_views, 0) - coalesce(b.baseline_views, 0))::bigint popularity,
       coalesce(o.old_rank, 9223372036854775807::bigint) old_rank,
       w.sort_key
    FROM public.popularity_works w
    LEFT JOIN public.popularity_work_totals t ON t.work_id=w.work_id
    LEFT JOIN public.popularity_baselines b ON b.work_id=w.work_id
    LEFT JOIN old_positions o ON o.work_id=w.work_id
    WHERE w.is_public
  ), ranked AS (
    SELECT id, popularity,
           row_number() OVER (ORDER BY popularity DESC, old_rank, sort_key, id) AS n
      FROM calculated
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'popularity',popularity) ORDER BY n),'[]'::jsonb),
         coalesce(jsonb_agg(id ORDER BY n),'[]'::jsonb)
    INTO v_works,v_order FROM ranked;

  v_version := to_char(p_cutoff AT TIME ZONE 'UTC','YYYYMMDDHH24MISS') || '-p1';
  v_payload := jsonb_build_object(
    'version',v_version,
    'cutoff_at',to_char(p_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'works',v_works,'previous_order',v_order
  );
  INSERT INTO public.popularity_public_snapshot
      (singleton,snapshot_version,cutoff_at,payload)
    VALUES (1,v_version,p_cutoff,v_payload)
    ON CONFLICT (singleton) DO UPDATE SET
      snapshot_version=excluded.snapshot_version,
      cutoff_at=excluded.cutoff_at,
      published_at=now(),
      payload=excluded.payload;
  RETURN v_payload;
END;
$snapshot$;
REVOKE ALL ON FUNCTION public.popularity_publish_snapshot(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.popularity_publish_snapshot(timestamptz)
  TO service_role;

CREATE FUNCTION public.admin_set_popularity(p_work_id text,p_target bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $admin$
DECLARE
  v_views bigint;
  v_old_base bigint;
  v_old_anchor bigint;
  v_snapshot jsonb;
BEGIN
  -- 與現有正式會員後台一致：管理員角色 + AAL2 兩步驟驗證。
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'WB_NOT_ADMIN'; END IF;
  IF p_work_id IS NULL OR p_target IS NULL
     OR p_target < 0 OR p_target > 1000000000 THEN
    RAISE EXCEPTION 'WB_INVALID_POPULARITY';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(982413, 100);
  PERFORM 1 FROM public.popularity_works
    WHERE work_id=p_work_id AND is_public FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WB_UNKNOWN_OR_UNPUBLISHED_WORK'; END IF;

  SELECT total_views INTO v_views
    FROM public.popularity_work_totals WHERE work_id=p_work_id;
  v_views := coalesce(v_views,0);
  SELECT base_popularity,baseline_views
    INTO v_old_base,v_old_anchor
    FROM public.popularity_baselines WHERE work_id=p_work_id FOR UPDATE;
  INSERT INTO public.popularity_baselines(work_id,base_popularity,baseline_views)
    VALUES(p_work_id,p_target,v_views)
    ON CONFLICT(work_id) DO UPDATE SET
      base_popularity=excluded.base_popularity,
      baseline_views=excluded.baseline_views,
      updated_at=now();

  INSERT INTO public.popularity_adjustment_log(
    work_id,admin_user_id,old_base,old_baseline,new_base,new_baseline)
    VALUES(p_work_id,(SELECT auth.uid()),v_old_base,v_old_anchor,p_target,v_views);

  -- 第一階段無觀看計數：管理員設定後同交易立即更新首頁所讀的公開快照。
  v_snapshot := public.popularity_publish_snapshot(now());
  RETURN jsonb_build_object('work_id',p_work_id,'base',p_target,'anchor',v_views,
                            'snapshot_version',v_snapshot->>'version');
END;
$admin$;
REVOKE ALL ON FUNCTION public.admin_set_popularity(text,bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_popularity(text,bigint)
  TO authenticated;

-- 首頁只讀此經驗證 JSON，不允許一般使用者讀原始表、調整或發布。
CREATE FUNCTION public.popularity_snapshot_read()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $read$
  SELECT payload FROM public.popularity_public_snapshot WHERE singleton=1
$read$;
REVOKE ALL ON FUNCTION public.popularity_snapshot_read()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popularity_snapshot_read()
  TO anon, authenticated;

-- 不產生初始快照，避免將尚未計數的 0 觀看誤展示成正式人氣。
-- 第一次有 MFA 管理員核准的人氣設定後，首頁才開始取得公開數字。
COMMIT;
