-- G01 DRAFT / DO NOT RUN IN PRODUCTION. Phase 2 ONLY after compatible clients are deployed.
-- Never roll back to old broad SELECT grants without explicit privacy-risk acceptance.
-- Existing SELECT RLS and public FK embedding are retained; restrict columns at DB ACL.
BEGIN;
REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (id,username,display_name,avatar_url,avatar_color,bio,created_at,updated_at,name_changed_at,color_changed_at,username_changed_at)
  ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id,username,display_name,avatar_url,avatar_color,bio)
  ON public.profiles TO anon, authenticated;
-- Production preflight must verify inherited grants, all other relations/RPCs,
-- schema cache, and no direct or indirect access to private fields.
COMMIT;
