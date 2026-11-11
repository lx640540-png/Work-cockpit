-- Additive migration. Never changes an existing app_states payload.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cockpit_private;
REVOKE ALL ON SCHEMA cockpit_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA cockpit_private TO authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.app_state_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 version bigint NOT NULL, state jsonb NOT NULL, summary jsonb NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_state_history_owner_time ON public.app_state_history(user_id,created_at DESC);
ALTER TABLE public.app_state_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_state_history FROM anon, authenticated;
GRANT SELECT ON public.app_state_history TO authenticated;
GRANT ALL ON public.app_state_history TO service_role;
DROP POLICY IF EXISTS backup_owner_read ON public.app_state_history;
CREATE POLICY backup_owner_read ON public.app_state_history FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE TABLE IF NOT EXISTS cockpit_private.write_permits (pid integer, tx bigint, owner uuid, version bigint, PRIMARY KEY(pid,tx,owner));
REVOKE ALL ON cockpit_private.write_permits FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS public.cockpit_backup_credentials (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), encrypted_token text NOT NULL,
 folder_id text, connected_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE TABLE IF NOT EXISTS public.cockpit_backup_oauth (
 nonce_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.cockpit_backup_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 source_version bigint NOT NULL, content_hash text NOT NULL, status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','running','verified','failed','quarantined')),
 summary jsonb NOT NULL DEFAULT '{}', source_state jsonb NOT NULL, archive_payload jsonb, next_retry_at timestamptz, drive_file_id text, archive_hash text,
 attachment_count integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, lease_token uuid, error_code text, pinned boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz,
 UNIQUE(user_id,source_version,content_hash)
);
CREATE INDEX IF NOT EXISTS cockpit_backup_runs_owner_time ON public.cockpit_backup_runs(user_id,created_at DESC);
ALTER TABLE public.cockpit_backup_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cockpit_backup_oauth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cockpit_backup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cockpit_backup_credentials,public.cockpit_backup_oauth,public.cockpit_backup_runs FROM anon,authenticated;
GRANT ALL ON public.cockpit_backup_credentials,public.cockpit_backup_oauth,public.cockpit_backup_runs TO service_role;
GRANT SELECT ON public.cockpit_backup_runs TO authenticated;
DROP POLICY IF EXISTS backup_runs_owner_read ON public.cockpit_backup_runs;
CREATE POLICY backup_runs_owner_read ON public.cockpit_backup_runs FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE OR REPLACE FUNCTION cockpit_private.backup_summary(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('tasks',jsonb_array_length(coalesce(s->'tasks','[]')),'projects',jsonb_array_length(coalesce(s->'projects','[]')),
 'memos',jsonb_array_length(coalesce(s->'memos','[]')),'decisions',jsonb_array_length(coalesce(s->'decisions','[]')),
 'journalDays',(SELECT count(*) FROM jsonb_each(coalesce(s#>'{meta,workJournal,weeks}','{}')) w,
 LATERAL jsonb_each(coalesce(w.value->'days','{}')) d WHERE length(trim(regexp_replace(coalesce(d.value->>'content',''),'<[^>]*>|&nbsp;','','g')))>0),
 'quickNote',CASE WHEN coalesce(s#>>'{quickNote,delta,ops}','[]') NOT IN ('[]','[{"insert": "\n"}]') THEN 1 ELSE 0 END)
$$;
CREATE OR REPLACE FUNCTION cockpit_private.capture_state(p_owner uuid,p_state jsonb,p_version bigint,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 INSERT INTO public.app_state_history(user_id,version,state,summary,reason)
 VALUES(p_owner,p_version,(p_state-'snapshots')||'{"snapshots":[]}',cockpit_private.backup_summary(p_state),p_reason) RETURNING id INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION cockpit_private.guard_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb; b jsonb; k text; permitted boolean; risky boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COCKPIT_PROTECTED: deleting the state row is disabled' USING ERRCODE='P0001'; END IF;
 IF jsonb_typeof(NEW.state) IS DISTINCT FROM 'object' OR jsonb_typeof(NEW.state->'tasks') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.state->'projects') IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION 'COCKPIT_INVALID: tasks and projects must be arrays'; END IF;
 FOREACH k IN ARRAY ARRAY['memos','decisions'] LOOP
 IF NEW.state?k AND jsonb_typeof(NEW.state->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'COCKPIT_INVALID: invalid collection'; END IF;
 END LOOP;
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF NEW.user_id<>OLD.user_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'COCKPIT_VERSION: stale or invalid state version'; END IF;
 a:=cockpit_private.backup_summary(OLD.state);b:=cockpit_private.backup_summary(NEW.state);
 FOR k IN SELECT jsonb_object_keys(a) LOOP
 IF (a->>k)::int>0 AND ((b->>k)::int=0 OR ((a->>k)::int>=10 AND (b->>k)::numeric<(a->>k)::numeric/2)) THEN risky:=true; END IF;
 END LOOP;
 DELETE FROM cockpit_private.write_permits WHERE pid=pg_backend_pid() AND tx=txid_current() AND owner=NEW.user_id AND version=OLD.version RETURNING true INTO permitted;
 IF risky AND NOT coalesce(permitted,false) THEN RAISE EXCEPTION 'COCKPIT_PROTECTED: mass removal requires explicit replacement with a safety copy'; END IF;
 IF permitted OR NOT EXISTS(SELECT 1 FROM public.app_state_history WHERE user_id=OLD.user_id AND created_at>=date_trunc('hour',now())) THEN
 PERFORM cockpit_private.capture_state(OLD.user_id,OLD.state,OLD.version,CASE WHEN permitted THEN 'confirmed-replacement' ELSE 'hourly-before-write' END);
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cockpit_state_guard ON public.app_states;
CREATE TRIGGER cockpit_state_guard BEFORE INSERT OR UPDATE OR DELETE ON public.app_states FOR EACH ROW EXECUTE FUNCTION cockpit_private.guard_state();
CREATE OR REPLACE FUNCTION cockpit_private.replace_state(p_state jsonb,p_expected_version bigint,p_device text,p_confirmation text,p_owner uuid)
RETURNS SETOF public.app_states LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); old_version bigint;
BEGIN
 IF owner IS NULL OR owner IS DISTINCT FROM p_owner OR p_confirmation IS DISTINCT FROM 'REPLACE' THEN RAISE EXCEPTION 'Explicit owner confirmation required'; END IF;
 SELECT version INTO old_version FROM public.app_states WHERE user_id=owner FOR UPDATE;
 IF old_version IS NULL OR old_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'COCKPIT_CONFLICT: cloud version changed'; END IF;
 INSERT INTO cockpit_private.write_permits VALUES(pg_backend_pid(),txid_current(),owner,old_version);
 RETURN QUERY UPDATE public.app_states SET state=p_state,version=old_version+1,device_id=p_device WHERE user_id=owner RETURNING *;
END $$;
CREATE OR REPLACE FUNCTION public.cockpit_replace_state(p_state jsonb,p_expected_version bigint,p_device text,p_confirmation text,p_owner uuid)
RETURNS SETOF public.app_states LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM cockpit_private.replace_state(p_state,p_expected_version,p_device,p_confirmation,p_owner) $$;
CREATE OR REPLACE FUNCTION cockpit_private.manual_checkpoint() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.app_states; result uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO r FROM public.app_states WHERE user_id=auth.uid() FOR SHARE;
 IF r.user_id IS NULL THEN RAISE EXCEPTION 'No synchronized state'; END IF;
 RETURN cockpit_private.capture_state(r.user_id,r.state,r.version,'manual');
END $$;
CREATE OR REPLACE FUNCTION public.cockpit_checkpoint() RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cockpit_private.manual_checkpoint() $$;
CREATE OR REPLACE FUNCTION public.cockpit_backup_claim(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE claimed uuid; owner uuid;
BEGIN
 SELECT user_id INTO owner FROM public.cockpit_backup_runs WHERE id=p_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF EXISTS(SELECT 1 FROM public.cockpit_backup_runs WHERE user_id=owner AND id<>p_id AND status='running' AND lease_until>now()) THEN RETURN false; END IF;
 UPDATE public.cockpit_backup_runs SET status='running',lease_until=now()+interval '20 minutes',lease_token=p_token,attempts=attempts+1,error_code=NULL
 WHERE id=p_id AND status IN ('pending','failed','running') AND (lease_until IS NULL OR lease_until<now()) RETURNING id INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.cockpit_backup_objects(p_owner uuid) RETURNS TABLE(bucket_id text,name text,metadata jsonb,updated_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT o.bucket_id,o.name,o.metadata,o.updated_at FROM storage.objects o
 WHERE o.bucket_id IN ('task-attachments','task-files') AND starts_with(o.name,p_owner::text||'/') ORDER BY o.bucket_id,o.name $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cockpit_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit_private.replace_state(jsonb,bigint,text,text,uuid),cockpit_private.manual_checkpoint() TO authenticated;
REVOKE ALL ON FUNCTION public.cockpit_replace_state(jsonb,bigint,text,text,uuid),public.cockpit_checkpoint() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cockpit_replace_state(jsonb,bigint,text,text,uuid),public.cockpit_checkpoint() TO authenticated;
REVOKE ALL ON FUNCTION public.cockpit_backup_claim(uuid,uuid),public.cockpit_backup_objects(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cockpit_backup_claim(uuid,uuid),public.cockpit_backup_objects(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.cockpit_backup_prune_history(p_owner uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 DELETE FROM public.app_state_history h WHERE h.user_id=p_owner
 AND EXISTS(SELECT 1 FROM public.cockpit_backup_runs WHERE user_id=p_owner AND status='verified')
 AND h.id NOT IN (SELECT id FROM public.app_state_history WHERE user_id=p_owner ORDER BY created_at DESC LIMIT 1)
 AND NOT (h.created_at>=now()-interval '48 hours'
 OR (h.reason IN ('manual','confirmed-replacement') AND h.created_at>=now()-interval '90 days')
 OR (h.created_at>=now()-interval '30 days' AND h.id IN
 (SELECT DISTINCT ON (date_trunc('day',created_at)) id FROM public.app_state_history WHERE user_id=p_owner ORDER BY date_trunc('day',created_at),created_at DESC)));
$$;
REVOKE ALL ON FUNCTION public.cockpit_backup_prune_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cockpit_backup_prune_history(uuid) TO service_role;
COMMIT;
