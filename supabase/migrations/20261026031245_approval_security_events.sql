BEGIN;
CREATE TABLE alp_private.alp_security_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid,
 event_name text NOT NULL CHECK (event_name IN ('approval_rate_limited','approval_denied','approval_invalid_state')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alp_private.alp_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_security_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_security_events FROM PUBLIC,anon,authenticated;
GRANT INSERT ON alp_private.alp_security_events TO service_role;
GRANT USAGE ON SEQUENCE alp_private.alp_security_events_id_seq TO service_role;
CREATE FUNCTION alp_private.record_approval_security_event(p_actor uuid,p_event text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
BEGIN
 IF p_actor IS NULL OR p_event IS NULL OR p_event NOT IN ('approval_rate_limited','approval_denied','approval_invalid_state') THEN
   RAISE EXCEPTION 'invalid security event' USING ERRCODE='22023';
 END IF;
 INSERT INTO alp_private.alp_security_events(actor_id,event_name) VALUES(p_actor,p_event);
END $body$;
REVOKE ALL ON FUNCTION alp_private.record_approval_security_event(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION alp_private.record_approval_security_event(uuid,text) TO service_role;
COMMIT;
