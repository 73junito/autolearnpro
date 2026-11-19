-- D02-E-R3B: narrowly scoped, read-only, authenticated-session existence oracle.
-- Called only after the Worker independently validates the bearer with GoTrue.
-- Does not expose auth.sessions directly to any approval login or client.
BEGIN;

CREATE FUNCTION alp_private.approval_session_active(p_actor uuid, p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_actor IS NOT NULL AND p_session IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.sessions AS s
      WHERE s.id = p_session
        AND s.user_id = p_actor
        AND (s.not_after IS NULL OR s.not_after > CURRENT_TIMESTAMP)
    );
$$;

-- Revoke default PUBLIC EXECUTE before commit, including through PUBLIC inheritance.
REVOKE ALL ON FUNCTION alp_private.approval_session_active(uuid,uuid)
  FROM PUBLIC, anon, authenticated, alp_academic_executor,
       alp_academic_worker_login, alp_approval_worker_login;
GRANT EXECUTE ON FUNCTION alp_private.approval_session_active(uuid,uuid)
  TO alp_approval_executor;

-- Non-privileged logins never receive USAGE or SELECT on auth schema/tables.
-- This function is intentionally a restricted boolean query, not a general
-- SECURITY DEFINER SQL endpoint. Input types are two UUIDs only.
COMMIT;
