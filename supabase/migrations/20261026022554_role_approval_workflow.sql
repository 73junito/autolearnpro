-- Foundation 7: internal requests and privileged reviewer decisions.
-- Caller MUST be trusted server code that verifies JWT and derives actor_id.
BEGIN;
CREATE TABLE alp_private.alp_role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role text NOT NULL CHECK (requested_role IN ('student','instructor','administrator')),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  request_reason text NOT NULL CHECK (length(btrim(request_reason)) BETWEEN 8 AND 500),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT decision_consistent CHECK (
    (state='pending' AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
    OR (state IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL
        AND length(btrim(decision_reason)) BETWEEN 8 AND 500)
  )
);
ALTER TABLE alp_private.alp_role_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_role_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_role_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE(state,decided_by,decision_reason,decided_at)
  ON alp_private.alp_role_requests TO service_role;

CREATE FUNCTION alp_private.submit_role_request(
  p_target uuid, p_role text, p_requester uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $body$
DECLARE new_id uuid;
BEGIN
  IF p_target IS NULL OR p_requester IS NULL OR p_role IS NULL
    OR p_role NOT IN ('student','instructor','administrator')
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'invalid role request' USING ERRCODE='22023';
  END IF;
  -- High privilege requests require a separate approval workflow; never auto-grant.
  INSERT INTO alp_private.alp_role_requests(target_id,requested_role,requested_by,request_reason)
  VALUES(p_target,p_role,p_requester,btrim(p_reason)) RETURNING id INTO new_id;
  RETURN new_id;
END
$body$;
REVOKE ALL ON FUNCTION alp_private.submit_role_request(uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION alp_private.submit_role_request(uuid,text,uuid,text) TO service_role;

CREATE FUNCTION alp_private.decide_role_request(
  p_request_id uuid, p_reviewer uuid, p_approve boolean, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $body$
DECLARE r alp_private.alp_role_requests%ROWTYPE;
BEGIN
 IF p_request_id IS NULL OR p_reviewer IS NULL OR p_approve IS NULL
   OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
   RAISE EXCEPTION 'invalid approval decision' USING ERRCODE='22023';
 END IF;
 SELECT * INTO r FROM alp_private.alp_role_requests
 WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.state <> 'pending' THEN
   RAISE EXCEPTION 'request not pending' USING ERRCODE='22023';
 END IF;
 IF p_reviewer=r.requested_by OR p_reviewer=r.target_id THEN
   RAISE EXCEPTION 'self-approval prohibited' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM alp_private.alp_role_assignments
  WHERE user_id=p_reviewer AND role_name='administrator'
 ) THEN
   RAISE EXCEPTION 'administrator reviewer required' USING ERRCODE='42501';
 END IF;
 -- Administrator elevation requires an additional, independent gate not yet built.
 IF p_approve AND r.requested_role='administrator' THEN
   RAISE EXCEPTION 'administrator elevation requires independent review' USING ERRCODE='42501';
 END IF;
 UPDATE alp_private.alp_role_requests
 SET state=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 decided_by=p_reviewer,decision_reason=btrim(p_reason),decided_at=now()
 WHERE id=p_request_id;
 IF p_approve THEN
   PERFORM alp_private.manage_role(r.target_id,r.requested_role,'grant',
      p_reviewer,left('approved request '||p_request_id::text||': '||btrim(p_reason),500));
 END IF;
END
$body$;
REVOKE ALL ON FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
 TO service_role;
COMMIT;