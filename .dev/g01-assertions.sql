-- Only fake rows. psql ON_ERROR_STOP required.
CREATE TRIGGER profiles_change_once BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_change_once();
INSERT INTO public.profiles(id,display_name) VALUES ('00000000-0000-0000-0000-000000000001','A'),('00000000-0000-0000-0000-000000000002','B');
INSERT INTO public.comments VALUES(1,'00000000-0000-0000-0000-000000000001','fake');
SET ROLE anon;
DO $$ BEGIN
  PERFORM p.display_name,c.body FROM public.comments c JOIN public.profiles p ON p.id=c.user_id;
  BEGIN PERFORM created_at FROM public.profiles; RAISE EXCEPTION 'private select allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_my_profile('00000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'anonymous RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; r jsonb; BEGIN
  BEGIN PERFORM name_changed_at FROM public.profiles WHERE id=b; RAISE EXCEPTION 'private field allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_my_profile(b); RAISE EXCEPTION 'cross-account read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.update_my_profile(b,'bad',NULL,NULL,NULL); RAISE EXCEPTION 'cross-account update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.update_my_profile(a,'A',NULL,NULL,'orange'); RAISE EXCEPTION 'orange allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r:=public.update_my_profile(a,'甲','aaa','fake','blue');
  IF r->>'id'<>a::text OR r->>'name_changed_at' IS NULL OR r->>'color_changed_at' IS NULL OR r->>'username_changed_at' IS NULL THEN RAISE EXCEPTION 'bad owner update'; END IF;
  BEGIN PERFORM public.update_my_profile(a,'乙','aaa','fake','blue'); RAISE EXCEPTION 'name lock missing'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'WB_NAME_LOCKED' THEN RAISE; END IF; END;
  BEGIN PERFORM public.update_my_profile(a,'甲','bbb','fake','blue'); RAISE EXCEPTION 'username lock missing'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'WB_USERNAME_LOCKED' THEN RAISE; END IF; END;
  BEGIN PERFORM public.update_my_profile(a,'甲','aaa','fake','green'); RAISE EXCEPTION 'color lock missing'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'WB_COLOR_LOCKED' THEN RAISE; END IF; END;
  r:=public.update_my_profile(a,'甲','aaa','updated','blue');
  IF r->>'bio'<>'updated' THEN RAISE EXCEPTION 'bio update failed'; END IF;
  IF (SELECT display_name FROM public.profiles WHERE id=b)<>'B' THEN RAISE EXCEPTION 'B modified'; END IF;
END $$;
RESET ROLE;
INSERT INTO public.banned_users VALUES('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.update_my_profile('00000000-0000-0000-0000-000000000001','甲','aaa','blocked','blue'); RAISE EXCEPTION 'banned update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'G01 isolated PostgreSQL ACL / owner / RLS / change-lock checks passed' AS result;
