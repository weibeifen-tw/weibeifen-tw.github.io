-- 《未備份》公開人氣 V1.0｜未執行的資料庫草案
-- 僅供審查。未完成可信任觀看入口、反灌水、每日快照發布、回滾與完整權限測試。
-- 正式 SQL 僅能依站長核准的部署計畫套用。不可直接執行本檔。
-- 本草案與 2026-11-23 正式 Supabase public.is_admin() 相容（admin + aal2）。
BEGIN;

CREATE TABLE public.popularity_works (
  work_id text PRIMARY KEY CHECK (work_id ~ '^[a-z0-9_-]{1,40}$'),
  is_public boolean NOT NULL DEFAULT false,
  sort_key integer NOT NULL DEFAULT 0
);

-- 此表需要和網站章節授權清單同步；不能靠網址存在就算公開。
CREATE TABLE public.popularity_chapters (
  chapter_path text PRIMARY KEY,
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  is_public boolean NOT NULL DEFAULT false,
  CONSTRAINT popularity_chapter_path_check CHECK (
    chapter_path ~ '^/t/[a-zA-Z0-9_-]+/$' AND length(chapter_path) <= 180
  ),
  CONSTRAINT popularity_chapter_work_unique UNIQUE (work_id, chapter_path)
);

-- 原始事件只用於事件重送冪等和短期核對；須另外設計保留期。
CREATE TABLE public.popularity_view_events (
  event_id uuid PRIMARY KEY,
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  chapter_path text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT popularity_event_chapter_owner_fk FOREIGN KEY (work_id, chapter_path)
    REFERENCES public.popularity_chapters(work_id, chapter_path),
  CONSTRAINT popularity_event_path_check CHECK (
    chapter_path IS NULL OR
    (chapter_path ~ '^/t/[a-zA-Z0-9_-]+/$' AND length(chapter_path) <= 180)
  )
);
CREATE INDEX popularity_events_day_idx
  ON public.popularity_view_events (recorded_at, work_id);
CREATE INDEX popularity_events_work_idx
  ON public.popularity_view_events (work_id, recorded_at);

-- 每分鐘跨 Edge 執行個體共用的限流計數；由後端以 HMAC 來源特徵產生 rate_key。
-- 30 次／分鐘僅為待測試的草案門檻，非已核准正式值。
CREATE TABLE public.popularity_rate_buckets (
  rate_key text NOT NULL CHECK (rate_key ~ '^[a-f0-9]{64}$'),
  minute_bucket bigint NOT NULL,
  event_count integer NOT NULL CHECK (event_count BETWEEN 1 AND 30),
  PRIMARY KEY (rate_key, minute_bucket)
);

CREATE TABLE public.popularity_work_totals (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.popularity_chapter_totals (
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  chapter_path text NOT NULL,
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, chapter_path),
  CONSTRAINT popularity_chapter_total_owner_fk FOREIGN KEY (work_id, chapter_path)
    REFERENCES public.popularity_chapters(work_id, chapter_path)
);
CREATE TABLE public.popularity_baselines (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  base_popularity bigint NOT NULL DEFAULT 0 CHECK (base_popularity >= 0),
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

-- 未建立任何公開表格政策；訪客只可通過經審查的函式取得公開快照。
ALTER TABLE public.popularity_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_work_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_chapter_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_adjustment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_public_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.popularity_works, public.popularity_chapters, public.popularity_view_events,
  public.popularity_work_totals, public.popularity_chapter_totals,
  public.popularity_rate_buckets,
  public.popularity_baselines, public.popularity_adjustment_log,
  public.popularity_public_snapshot
FROM PUBLIC, anon, authenticated;

-- 管理員手動指定人氣；鎖定同一作品以串行化計數與基準重設。
CREATE FUNCTION public.admin_set_popularity(p_work_id text, p_target bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_views bigint;
  v_old_base bigint;
  v_old_anchor bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'WB_NOT_ADMIN'; END IF;
  IF p_target IS NULL OR p_target < 0 OR p_target > 1000000000 THEN
    RAISE EXCEPTION 'WB_INVALID_POPULARITY';
  END IF;
  PERFORM 1 FROM public.popularity_works
    WHERE work_id = p_work_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WB_UNKNOWN_WORK'; END IF;

  SELECT total_views INTO v_views
    FROM public.popularity_work_totals WHERE work_id = p_work_id;
  v_views := COALESCE(v_views, 0);

  SELECT base_popularity, baseline_views INTO v_old_base, v_old_anchor
    FROM public.popularity_baselines WHERE work_id = p_work_id;
  INSERT INTO public.popularity_baselines (work_id, base_popularity, baseline_views)
    VALUES (p_work_id, p_target, v_views)
    ON CONFLICT (work_id) DO UPDATE
      SET base_popularity = EXCLUDED.base_popularity,
          baseline_views = EXCLUDED.baseline_views,
          updated_at = now();

  INSERT INTO public.popularity_adjustment_log
    (work_id, admin_user_id, old_base, old_baseline, new_base, new_baseline)
    VALUES (p_work_id, auth.uid(), v_old_base, v_old_anchor, p_target, v_views);

  RETURN jsonb_build_object('work_id', p_work_id, 'base', p_target, 'anchor', v_views);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_set_popularity(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_popularity(text, bigint) TO authenticated;

-- 只能由可信任的後端角色調用；函式前端不能直接存取。
-- 必須先通過可信任請求驗證與流量限制，絕對不可直接公開此 RPC。
CREATE FUNCTION public.popularity_record_view(
  p_event_id uuid, p_work_id text, p_rate_key text, p_chapter_path text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_inserted uuid;
  v_hits integer;
  v_bucket bigint;
BEGIN
  IF p_event_id IS NULL OR p_work_id IS NULL THEN
    RAISE EXCEPTION 'WB_INVALID_EVENT';
  END IF;
  PERFORM 1 FROM public.popularity_works
    WHERE work_id = p_work_id AND is_public FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WB_UNPUBLISHED_WORK'; END IF;

  IF p_rate_key IS NULL OR p_rate_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'WB_INVALID_RATE_KEY';
  END IF;
  -- 同一次事件重送不占用限流配額。
  IF EXISTS (
    SELECT 1 FROM public.popularity_view_events WHERE event_id = p_event_id
  ) THEN RETURN false; END IF;

  IF p_chapter_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.popularity_chapters
    WHERE work_id = p_work_id AND chapter_path = p_chapter_path AND is_public
  ) THEN RAISE EXCEPTION 'WB_INVALID_CHAPTER_OWNERSHIP'; END IF;

  -- 跨執行個體 DB 原子限流，不使用單一 Edge 記憶體計數器。
  v_bucket := floor(extract(epoch FROM clock_timestamp()) / 60)::bigint;
  INSERT INTO public.popularity_rate_buckets(rate_key, minute_bucket, event_count)
    VALUES (p_rate_key, v_bucket, 1)
    ON CONFLICT (rate_key, minute_bucket) DO UPDATE
      SET event_count = public.popularity_rate_buckets.event_count + 1
      WHERE public.popularity_rate_buckets.event_count < 30
    RETURNING event_count INTO v_hits;
  IF v_hits IS NULL THEN RAISE EXCEPTION 'WB_RATE_LIMITED'; END IF;

  INSERT INTO public.popularity_view_events(event_id, work_id, chapter_path)
    VALUES (p_event_id, p_work_id, p_chapter_path)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN false; END IF;

  INSERT INTO public.popularity_work_totals(work_id,total_views)
    VALUES (p_work_id,1)
    ON CONFLICT (work_id) DO UPDATE
      SET total_views = public.popularity_work_totals.total_views + 1,
          updated_at = now();
  IF p_chapter_path IS NOT NULL THEN
    INSERT INTO public.popularity_chapter_totals(work_id,chapter_path,total_views)
      VALUES (p_work_id,p_chapter_path,1)
      ON CONFLICT (work_id, chapter_path) DO UPDATE
        SET total_views = public.popularity_chapter_totals.total_views + 1,
            updated_at = now();
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.popularity_record_view(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.popularity_record_view(uuid,text,text,text) TO service_role;

-- 只公開經過驗證的快照 payload，不包含管理員紀錄與原始事件。
CREATE FUNCTION public.popularity_snapshot_read()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT payload FROM public.popularity_public_snapshot WHERE singleton = 1
$fn$;
REVOKE ALL ON FUNCTION public.popularity_snapshot_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popularity_snapshot_read() TO anon, authenticated;

COMMIT;
