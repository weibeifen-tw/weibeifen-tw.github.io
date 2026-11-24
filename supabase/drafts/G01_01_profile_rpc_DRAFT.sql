-- G01 DRAFT / DO NOT RUN IN PRODUCTION. Phase 1: additive RPC only.
-- Requires separate owner approval and isolated PostgreSQL/PostgREST validation.
BEGIN;
CREATE FUNCTION public.get_my_profile(p_expected_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  -- Expected UID is an assertion, never a row selector. No anonymous access.
  IF v_uid IS NULL OR p_expected_uid IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'WB_IDENTITY_CHANGED' USING ERRCODE = '42501';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'avatar_color', p.avatar_color, 'bio', p.bio,
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'name_changed_at', p.name_changed_at, 'color_changed_at', p.color_changed_at,
    'username_changed_at', p.username_changed_at)
  INTO v_result FROM public.profiles p WHERE p.id = v_uid;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_my_profile(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile(uuid) TO authenticated;

-- Invoker: existing UPDATE column grants, RLS (ban/orange/ownership),
-- constraints and one-time-change triggers remain authoritative.
CREATE FUNCTION public.update_my_profile(p_expected_uid uuid, p_display_name text,
  p_username text, p_bio text, p_avatar_color text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE v_uid uuid := auth.uid(); v_count bigint;
BEGIN
  IF v_uid IS NULL OR p_expected_uid IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'WB_IDENTITY_CHANGED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET display_name = p_display_name, username = p_username,
    bio = p_bio, avatar_color = p_avatar_color WHERE id = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'WB_PROFILE_UPDATE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN public.get_my_profile(v_uid);
END;
$fn$;
REVOKE ALL ON FUNCTION public.update_my_profile(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(uuid,text,text,text,text) TO authenticated;
COMMIT;
