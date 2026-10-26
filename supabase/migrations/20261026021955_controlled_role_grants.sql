-- Trusted-backend-only role assignment. Never expose alp_private in PostgREST.
BEGIN;
CREATE TABLE alp_private.alp_role_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  role_name text NOT NULL CHECK (role_name IN ('student','instructor','administrator')),
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alp_private.alp_role_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_role_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_role_audit FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA alp_private TO service_role;
GRANT SELECT, INSERT, DELETE ON alp_private.alp_role_assignments TO service_role;
GRANT INSERT ON alp_private.alp_role_audit TO service_role;
GRANT USAGE ON SEQUENCE alp_private.alp_role_audit_id_seq TO service_role;
CREATE FUNCTION alp_private.manage_role(
  p_user_id uuid, p_role text, p_action text, p_actor_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $body$
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL
     OR p_role IS NULL OR p_role NOT IN ('student','instructor','administrator')
     OR p_action IS NULL OR p_action NOT IN ('grant','revoke')
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'invalid role management request' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'grant' THEN
    INSERT INTO alp_private.alp_role_assignments(user_id,role_name)
    VALUES (p_user_id,p_role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM alp_private.alp_role_assignments
      WHERE user_id=p_user_id AND role_name=p_role;
  END IF;
  INSERT INTO alp_private.alp_role_audit(user_id,role_name,action,actor_id,reason)
  VALUES(p_user_id,p_role,p_action,p_actor_id,btrim(p_reason));
END
$body$;
REVOKE ALL ON FUNCTION alp_private.manage_role(uuid,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION alp_private.manage_role(uuid,text,text,uuid,text) TO service_role;
COMMIT;
