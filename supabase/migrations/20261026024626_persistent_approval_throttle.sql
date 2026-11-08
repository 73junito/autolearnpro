BEGIN;
CREATE TABLE alp_private.alp_approval_rate_limits (
 actor_id uuid PRIMARY KEY,
 window_started timestamptz NOT NULL,
 attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 2147483647)
);
ALTER TABLE alp_private.alp_approval_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_approval_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_approval_rate_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON alp_private.alp_approval_rate_limits TO service_role;
CREATE FUNCTION alp_private.consume_approval_quota(p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $body$
DECLARE allowed boolean;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'missing actor' USING ERRCODE='22023'; END IF;
 INSERT INTO alp_private.alp_approval_rate_limits(actor_id,window_started,attempts)
 VALUES(p_actor,clock_timestamp(),1)
 ON CONFLICT (actor_id) DO UPDATE
 SET window_started=CASE WHEN alp_private.alp_approval_rate_limits.window_started <= clock_timestamp()-interval '60 seconds'
  THEN clock_timestamp() ELSE alp_private.alp_approval_rate_limits.window_started END,
 attempts=CASE WHEN alp_private.alp_approval_rate_limits.window_started <= clock_timestamp()-interval '60 seconds'
  THEN 1 ELSE LEAST(alp_private.alp_approval_rate_limits.attempts+1,2147483647) END
 RETURNING attempts <= 6 INTO allowed;
 RETURN allowed;
END
$body$;
REVOKE ALL ON FUNCTION alp_private.consume_approval_quota(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION alp_private.consume_approval_quota(uuid) TO service_role;
COMMIT;
