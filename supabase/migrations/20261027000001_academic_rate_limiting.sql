-- Stage 2 remediation: independent academic rate limiting.
-- Separate from approval quotas. Read and write scopes have different limits.
BEGIN;

CREATE TABLE alp_private.alp_academic_rate_limits (
  actor_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('read', 'write')),
  window_started timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 2147483647),
  PRIMARY KEY (actor_id, scope)
);

ALTER TABLE alp_private.alp_academic_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_academic_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_academic_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON alp_private.alp_academic_rate_limits TO service_role;

-- Read scope: 60 requests per 60 seconds (normal browsing)
-- Write scope: 10 requests per 60 seconds (enrollment/progress mutations)
CREATE FUNCTION alp_private.consume_academic_quota(p_actor uuid, p_scope text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $body$
DECLARE allowed boolean;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'missing actor' USING ERRCODE='22023'; END IF;
  IF p_scope NOT IN ('read', 'write') THEN RAISE EXCEPTION 'invalid scope' USING ERRCODE='22023'; END IF;
  IF p_limit < 1 THEN RAISE EXCEPTION 'invalid limit' USING ERRCODE='22023'; END IF;
  INSERT INTO alp_private.alp_academic_rate_limits(actor_id, scope, window_started, attempts)
  VALUES(p_actor, p_scope, clock_timestamp(), 1)
  ON CONFLICT (actor_id, scope) DO UPDATE
  SET window_started = CASE WHEN alp_private.alp_academic_rate_limits.window_started <= clock_timestamp() - interval '60 seconds'
       THEN clock_timestamp() ELSE alp_private.alp_academic_rate_limits.window_started END,
      attempts = CASE WHEN alp_private.alp_academic_rate_limits.window_started <= clock_timestamp() - interval '60 seconds'
       THEN 1 ELSE LEAST(alp_private.alp_academic_rate_limits.attempts + 1, 2147483647) END
  RETURNING attempts <= p_limit INTO allowed;
  RETURN allowed;
END
$body$;

REVOKE ALL ON FUNCTION alp_private.consume_academic_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION alp_private.consume_academic_quota(uuid, text, integer) TO service_role;

COMMIT;
