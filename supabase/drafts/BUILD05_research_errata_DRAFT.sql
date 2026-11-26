-- DRAFT ONLY. Review existing is_admin() and is_banned() definitions on target before execution.
-- No existing table or policy changes. Run in isolated staging first; never auto-run.
BEGIN;
CREATE TABLE public.research_errata_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 article_id text NOT NULL CHECK (article_id ~ '^IND-[1-7]-[0-9]{2}-[0-9]{2}$'),
 article_version text NOT NULL CHECK (char_length(article_version) BETWEEN 1 AND 40),
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
 reviewed_at timestamptz,
 CHECK ((status='pending' AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_at IS NOT NULL))
);
ALTER TABLE public.research_errata_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_errata_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.research_errata_reports TO authenticated;
GRANT INSERT(article_id,article_version,body) ON public.research_errata_reports TO authenticated;
GRANT UPDATE(status,reviewed_at) ON public.research_errata_reports TO authenticated;
CREATE POLICY errata_own_or_admin_read ON public.research_errata_reports FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id OR (SELECT public.is_admin()));
CREATE POLICY errata_member_submit ON public.research_errata_reports FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id=(SELECT auth.uid()) AND status='pending' AND reviewed_at IS NULL AND NOT (SELECT public.is_banned()));
CREATE POLICY errata_admin_review ON public.research_errata_reports FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE INDEX research_errata_owner_idx ON public.research_errata_reports(user_id,created_at DESC);
-- Public corrections intentionally live separately in owner-approved static metadata, not a view of private reports.
-- Required before enabling UI: verify published article/version allowlist server-side, spam/rate limits, admin UUID whitelist and MFA, deletion lifecycle, two-member RLS tests, anonymous deny, reviewer-only updates.
-- This draft deliberately rolls back. Change to COMMIT only after separate approval and isolated validation.
ROLLBACK;
