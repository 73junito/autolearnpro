-- R3C: lock the *verified* actor's session row within the very same
-- transaction as its signed approval RPC. A concurrent signout DELETE or
-- UPDATE of auth.sessions must wait until the decision transaction commits.
-- Strictly narrow executor-only SECURITY DEFINER; no table grants.
BEGIN;

CREATE FUNCTION alp_private.lock_approval_actor_session(p_actor uuid,p_session uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  locked_session uuid;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT s.id INTO locked_session
  FROM auth.sessions AS s
  WHERE s.id = p_session
    AND s.user_id = p_actor
    AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
  FOR SHARE;
  RETURN locked_session IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION alp_private.lock_approval_actor_session(uuid,uuid)
  FROM PUBLIC, anon, authenticated, alp_academic_executor,
       alp_academic_worker_login, alp_approval_worker_login;
GRANT EXECUTE ON FUNCTION alp_private.lock_approval_actor_session(uuid,uuid)
  TO alp_approval_executor;

COMMIT;
