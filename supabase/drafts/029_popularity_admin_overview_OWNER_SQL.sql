-- 《未備份》人氣後台查閱紀錄（站長專用 SQL 草案）
-- 不修改或刪除任何既有資料；僅建立受 MFA/管理員驗證保護的唯讀 RPC。
-- 由站長於 Supabase SQL Editor 執行後，後台才能顯示完整歷次紀錄。
BEGIN;
CREATE FUNCTION public.admin_popularity_overview(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_works jsonb;
  v_history jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'WB_NOT_ADMIN'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'WB_INVALID_LIMIT';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', w.work_id,
    'configured', (b.work_id IS NOT NULL),
    'popularity', greatest(0,
      coalesce(b.base_popularity,0) + coalesce(t.total_views,0)
      - coalesce(b.baseline_views,0)),
    'updated_at', b.updated_at
  ) ORDER BY w.sort_key,w.work_id),'[]'::jsonb)
  INTO v_works
  FROM public.popularity_works w
  LEFT JOIN public.popularity_baselines b ON b.work_id=w.work_id
  LEFT JOIN public.popularity_work_totals t ON t.work_id=w.work_id
  WHERE w.is_public;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',h.id,'work_id',h.work_id,'old_value',h.old_base,
    'new_value',h.new_base,'changed_at',h.changed_at
  ) ORDER BY h.changed_at DESC,h.id DESC),'[]'::jsonb)
  INTO v_history
  FROM (
    SELECT id,work_id,old_base,new_base,changed_at
    FROM public.popularity_adjustment_log
    ORDER BY changed_at DESC,id DESC LIMIT p_limit
  ) h;

  RETURN pg_catalog.jsonb_build_object('works',v_works,'history',v_history);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_popularity_overview(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_popularity_overview(integer)
  TO authenticated;
COMMIT;
