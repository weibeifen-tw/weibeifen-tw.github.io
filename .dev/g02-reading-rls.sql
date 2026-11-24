-- G02: disposable PostgreSQL only; simulated claims, no Supabase connection.
CREATE TABLE public.reading_progress (
  user_id uuid NOT NULL,
  k text NOT NULL,
  url text NOT NULL,
  no text,
  title text,
  chr text,
  t bigint DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_pkey PRIMARY KEY (user_id, k);
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress insert" ON public.reading_progress AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "own progress select" ON public.reading_progress AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "own progress update" ON public.reading_progress AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
REVOKE ALL ON public.reading_progress FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.reading_progress TO authenticated;
INSERT INTO public.reading_progress(user_id,k,url) VALUES
('00000000-0000-0000-0000-000000000001','demo','/fake/a/'),
('00000000-0000-0000-0000-000000000002','demo','/fake/b/');
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.reading_progress; RAISE EXCEPTION 'anon read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.reading_progress(user_id,k,url) VALUES ('00000000-0000-0000-0000-000000000001','anon','/fake/'); RAISE EXCEPTION 'anon insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; n bigint; BEGIN
  IF (SELECT count(*) FROM public.reading_progress)<>1 OR (SELECT count(*) FROM public.reading_progress WHERE user_id=b)<>0 THEN RAISE EXCEPTION 'cross read'; END IF;
  INSERT INTO public.reading_progress(user_id,k,url) VALUES (a,'demo','/fake/a2/') ON CONFLICT(user_id,k) DO UPDATE SET url=excluded.url;
  IF (SELECT url FROM public.reading_progress WHERE user_id=a AND k='demo') IS DISTINCT FROM '/fake/a2/' THEN RAISE EXCEPTION 'owner upsert failed'; END IF;
  UPDATE public.reading_progress SET url='/fake/bad/' WHERE user_id=b; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'cross update'; END IF;
  BEGIN INSERT INTO public.reading_progress(user_id,k,url) VALUES (b,'new','/fake/') ; RAISE EXCEPTION 'cross insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.reading_progress(user_id,k,url) VALUES (b,'demo','/fake/') ON CONFLICT(user_id,k) DO UPDATE SET url=excluded.url; RAISE EXCEPTION 'cross upsert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.reading_progress SET user_id=b,k='new' WHERE user_id=a; RAISE EXCEPTION 'owner transfer'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.reading_progress WHERE user_id=a; RAISE EXCEPTION 'delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.reading_progress)<>1 OR (SELECT url FROM public.reading_progress WHERE k='demo') IS DISTINCT FROM '/fake/b/' THEN RAISE EXCEPTION 'B isolation failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.reading_progress)<>0 THEN RAISE EXCEPTION 'missing identity read'; END IF;
 BEGIN INSERT INTO public.reading_progress(user_id,k,url) VALUES ('00000000-0000-0000-0000-000000000001','missing','/fake/'); RAISE EXCEPTION 'missing identity insert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'G02 isolated PostgreSQL reading RLS checks passed' AS result;
