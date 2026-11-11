-- Runs after the migration in a separate transaction/schema. All fixtures are synthetic.
SELECT set_config('request.jwt.claim.sub','86825a70-186a-4f13-aaa8-e1374effc1e8',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO public.app_states(user_id,state,version) VALUES('86825a70-186a-4f13-aaa8-e1374effc1e8','{"tasks":[{"id":"t1","title":"fixture"},{"id":"t2"}],"projects":[{"id":"p1"}],"memos":[],"decisions":[],"meta":{"workJournal":{"weeks":{"w":{"days":{"d":{"content":"<p>record</p>"}}}}}}}',1);
UPDATE public.app_states SET state=jsonb_set(state,'{tasks,0,title}','"edited"'),version=2 WHERE user_id='86825a70-186a-4f13-aaa8-e1374effc1e8';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.app_state_history)<>1 THEN RAISE EXCEPTION 'No independent before image'; END IF;
 BEGIN
 UPDATE public.app_states SET state=jsonb_set(state,'{tasks}','[]'),version=3 WHERE user_id='86825a70-186a-4f13-aaa8-e1374effc1e8';
 RAISE EXCEPTION 'Missing mass removal protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'COCKPIT_PROTECTED:%' THEN RAISE; END IF; END;
 BEGIN DELETE FROM public.app_states; RAISE EXCEPTION 'Missing delete protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'COCKPIT_PROTECTED:%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.app_states SET version=99; RAISE EXCEPTION 'Missing CAS protection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'COCKPIT_VERSION:%' THEN RAISE; END IF; END;
END $$;
DO $$ DECLARE data jsonb; BEGIN
 data:=cockpit_private.backup_summary('{"tasks":[],"projects":[],"meta":{"workJournal":{"weeks":{"w":{"review":{"done":"<p>Review</p>"},"days":{"d":{"content":"<img src=x>"}}}}}},"weeks":{"w":{"top":["Plan"]}},"quickNote":{"delta":{"ops":[{"insert":"\n"}]}}}');
 IF (data->>'journalDays')::int<>2 OR (data->>'weekPlans')::int<>1 OR (data->>'quickNote')::int<>0 THEN RAISE EXCEPTION 'Review/image/plan/blank-note summary mismatch: %',data;END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT * FROM public.cockpit_replace_state('{"tasks":[],"projects":[],"memos":[],"decisions":[]}',2,'fixture','REPLACE','86825a70-186a-4f13-aaa8-e1374effc1e8');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.app_state_history)<>2 THEN RAISE EXCEPTION 'Replacement lost its old version'; END IF;
 IF (SELECT version FROM public.app_states)<>3 THEN RAISE EXCEPTION 'Replacement did not advance version'; END IF;
 BEGIN PERFORM public.cockpit_replace_state('{"tasks":[],"projects":[]}',3,'fixture',NULL,'86825a70-186a-4f13-aaa8-e1374effc1e8');RAISE EXCEPTION 'Null confirmation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Explicit owner confirmation required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.cockpit_replace_state('{"tasks":[],"projects":[]}',3,'fixture','REPLACE','8a441823-f408-4c4d-9745-e9deb9cdd5c7');RAISE EXCEPTION 'Different owner accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Explicit owner confirmation required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.cockpit_replace_state('{"tasks":[],"projects":[]}',2,'fixture','REPLACE','86825a70-186a-4f13-aaa8-e1374effc1e8');RAISE EXCEPTION 'Stale replace accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'COCKPIT_CONFLICT:%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.app_state_history SET state='{}'; RAISE EXCEPTION 'History is writable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.cockpit_backup_credentials; RAISE EXCEPTION 'Credentials exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.cockpit_backup_claim(gen_random_uuid(),gen_random_uuid());RAISE EXCEPTION 'Client can claim server jobs'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','8a441823-f408-4c4d-9745-e9deb9cdd5c7',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.app_state_history) THEN RAISE EXCEPTION 'Cross account history leak'; END IF;END $$;
RESET ROLE;
SELECT 'PASS: before-image, empty/category removal, row delete, version CAS, explicit replacement, rollback, append-only history, cross-account RLS, credential/RPC isolation' AS result;
