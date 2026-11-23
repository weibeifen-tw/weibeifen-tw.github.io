-- 《未備份》公開人氣 V1.0：後端資料結構草案（未執行）
-- 不得直接套用正式資料庫；先完成 GATE-01 / GATE-02 與 Supabase 即時結構核對。
-- 公開訪客不得直接寫表或呼叫計數函式；事件需經可信任 Edge Function 驗證。
-- 此草案僅建立最小資料層，尚未包含每日排程、通知、快照發布及完整防灌水。
-- 警告：任何 SECURITY DEFINER / 事件 API 必須在正式環境實測授權隔離後才能套用。

BEGIN;

CREATE TABLE IF NOT EXISTS public.popularity_works (
  work_id text PRIMARY KEY CHECK (work_id ~ '^[a-z0-9_-]{1,40}$'),
  is_public boolean NOT NULL DEFAULT false,
  sort_key integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.popularity_view_events (
  event_id uuid PRIMARY KEY,
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  chapter_path text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (chapter_path IS NULL OR (chapter_path ~ '^/t/[a-zA-Z0-9_-]+/?$' AND length(chapter_path) <= 180))
);
CREATE INDEX IF NOT EXISTS popularity_events_day_idx
  ON public.popularity_view_events (recorded_at, work_id);
CREATE INDEX IF NOT EXISTS popularity_events_work_idx
  ON public.popularity_view_events (work_id, recorded_at);

CREATE TABLE IF NOT EXISTS public.popularity_work_totals (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.popularity_chapter_totals (
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  chapter_path text NOT NULL,
  total_views bigint NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(work_id, chapter_path)
);
CREATE TABLE IF NOT EXISTS public.popularity_baselines (
  work_id text PRIMARY KEY REFERENCES public.popularity_works(work_id),
  base_popularity bigint NOT NULL DEFAULT 0 CHECK (base_popularity >= 0),
  baseline_views bigint NOT NULL DEFAULT 0 CHECK (baseline_views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.popularity_adjustment_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id text NOT NULL REFERENCES public.popularity_works(work_id),
  admin_user_id uuid NOT NULL,
  old_base bigint,
  old_baseline bigint,
  new_base bigint NOT NULL,
  new_baseline bigint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.popularity_public_snapshot (
  singleton integer PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  snapshot_version text NOT NULL,
  cutoff_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);

-- 開啟 RLS，且不建立訪客寫入政策。
ALTER TABLE public.popularity_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_view_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_work_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_chapter_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_adjustment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popularity_public_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.popularity_works, public.popularity_view_events,
  public.popularity_work_totals, public.popularity_chapter_totals,
  public.popularity_baselines, public.popularity_adjustment_log,
  public.popularity_public_snapshot FROM PUBLIC, anon, authenticated;

-- 後台管理員：手動設為當下人氣，並原子記錄真實觀看基準。
CREATE OR REPLACE FUNCTION public.admin_set_popularity(p_work_id text, p_target bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_current_views bigint;
  v_old_base bigint;
  v_old_baseline bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'WB_NOT_ADMIN';
  END IF;
  IF p_target IS NULL OR p_target < 0 OR p_target > 1000000000 THEN
    RAISE EXCEPTION 'WB_INVALID_POPULARITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.popularity_works WHERE work_id = p_work_id) THEN
    RAISE EXCEPTION 'WB_UNKNOWN_WORK';
  END IF;

  -- 鎖定作品列，使觀看寫入與手動重設以一致的先後順序進行。
  PERFORM 1 FROM public.popularity_works WHERE work_id = p_work_id FOR UPDATE;
  SELECT total_views INTO v_current_views
    FROM public.popularity_work_totals WHERE work_id = p_work_id;
  v_current_views := COALESCE(v_current_views, 0);
  SELECT base_popularity, baseline_views INTO v_old_base, v_old_baseline
    FROM public.popularity_baselines WHERE work_id = p_work_id;
  INSERT INTO public.popularity_baselines(work_id, base_popularity, baseline_views)
    VALUES (p_work_id, p_target, v_current_views)
    ON CONFLICT (work_id) DO UPDATE SET
      base_popularity = EXCLUDED.base_popularity,
      baseline_views = EXCLUDED.baseline_views,
      updated_at = now();
  INSERT INTO public.popularity_adjustment_log(
    work_id, admin_user_id, old_base, old_baseline, new_base, new_baseline)
    VALUES (p_work_id, auth.uid(), v_old_base, v_old_baseline, p_target, v_current_views);
  RETURN jsonb_build_object('work_id',p_work_id,'base',p_target,'baseline_views',v_current_views);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_popularity(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_popularity(text, bigint) TO authenticated;

-- 僅可信任後端 service_role 可提交一次已驗證的觀看事件。
-- 注意：事件 ID 由服務端接收/驗證；作品與章節的對照必須由服務端確認。
CREATE OR REPLACE FUNCTION public.popularity_record_view(
  p_event_id uuid, p_work_id text, p_chapter_path text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_event uuid;
BEGIN
  -- 執行權限只授予 service_role；不要使用已淘汰的 auth.role() 作授權。
  -- 後端仍須先驗證有效頁面事件、章節歸屬、簽章和限速。
  IF p_event_id IS NULL OR p_work_id IS NULL THEN
    RAISE EXCEPTION 'WB_INVALID_EVENT';
  END IF;
  PERFORM 1 FROM public.popularity_works WHERE work_id = p_work_id AND is_public FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WB_UNPUBLISHED_WORK'; END IF;

  INSERT INTO public.popularity_view_events(event_id, work_id, chapter_path)
  VALUES(p_event_id,p_work_id,p_chapter_path)
  ON CONFLICT (event_id) DO NOTHING RETURNING event_id INTO v_event;
  IF v_event IS NULL THEN RETURN false; END IF;

  INSERT INTO public.popularity_work_totals(work_id,total_views)
  VALUES(p_work_id,1)
  ON CONFLICT (work_id) DO UPDATE SET total_views=public.popularity_work_totals.total_views+1,
    updated_at=now();
  IF p_chapter_path IS NOT NULL THEN
    INSERT INTO public.popularity_chapter_totals(work_id,chapter_path,total_views)
    VALUES(p_work_id,p_chapter_path,1)
    ON CONFLICT (work_id,chapter_path) DO UPDATE SET
      total_views=public.popularity_chapter_totals.total_views+1,updated_at=now();
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.popularity_record_view(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.popularity_record_view(uuid,text,text) TO service_role;

-- 公開只讀快照：沒有原始事件、管理員資訊或調整歷史。
CREATE OR REPLACE FUNCTION public.popularity_snapshot_read()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT payload FROM public.popularity_public_snapshot WHERE singleton = 1
$$;
REVOKE ALL ON FUNCTION public.popularity_snapshot_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.popularity_snapshot_read() TO anon, authenticated;

COMMIT;
