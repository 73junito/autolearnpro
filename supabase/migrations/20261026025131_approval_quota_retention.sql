-- Housekeeping is trusted-backend-only and never exposed to browser clients.
BEGIN;
GRANT DELETE ON alp_private.alp_approval_rate_limits TO service_role;
CREATE FUNCTION alp_private.prune_approval_quota(p_max_rows integer DEFAULT 1000)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
DECLARE deleted_count integer;
BEGIN
  IF p_max_rows IS NULL OR p_max_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid cleanup batch size' USING ERRCODE='22023';
  END IF;
  WITH expired AS (
    SELECT actor_id FROM alp_private.alp_approval_rate_limits
    WHERE window_started < clock_timestamp() - interval '24 hours'
    ORDER BY window_started
    LIMIT p_max_rows
    FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM alp_private.alp_approval_rate_limits AS rl
    USING expired AS e WHERE rl.actor_id = e.actor_id
    RETURNING rl.actor_id
  ) SELECT count(*)::integer INTO deleted_count FROM removed;
  RETURN deleted_count;
END;
$body$;
REVOKE ALL ON FUNCTION alp_private.prune_approval_quota(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION alp_private.prune_approval_quota(integer) TO service_role;
COMMIT;
