-- Approval service: distinct non-login executor with only narrowly enumerated grants.
-- The production application must provision a separate nonprivileged NOINHERIT
-- login out of band and grant it SET (not INHERIT) membership in this role.
-- This role is NOT a substitute for verified JWT-to-actor binding in the API.
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 21 THEN
    RAISE EXCEPTION 'Approval executor requires exactly 21 prior migrations';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='alp_approval_executor') THEN
    RAISE EXCEPTION 'Approval executor already exists';
  END IF;
END
$guard$;

CREATE ROLE alp_approval_executor NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA alp_private TO alp_approval_executor;

-- SECURITY INVOKER approval routines must have their exact dependent permissions.
GRANT SELECT, INSERT, DELETE ON alp_private.alp_role_assignments TO alp_approval_executor;
GRANT INSERT ON alp_private.alp_role_audit TO alp_approval_executor;
GRANT USAGE ON SEQUENCE alp_private.alp_role_audit_id_seq TO alp_approval_executor;
GRANT SELECT, INSERT, UPDATE (state, decided_by, decision_reason, decided_at)
  ON alp_private.alp_role_requests TO alp_approval_executor;
GRANT SELECT, INSERT, UPDATE ON alp_private.alp_approval_rate_limits
  TO alp_approval_executor;
GRANT INSERT (actor_id, event_name) ON alp_private.alp_security_events
  TO alp_approval_executor;
GRANT USAGE ON SEQUENCE alp_private.alp_security_events_id_seq
  TO alp_approval_executor;

GRANT EXECUTE ON FUNCTION alp_private.submit_role_request(uuid,text,uuid,text)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.manage_role(uuid,text,text,uuid,text)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.consume_approval_quota(uuid)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.record_approval_security_event(uuid,text)
  TO alp_approval_executor;

-- All involved private tables have FORCE ROW LEVEL SECURITY.
-- This role is a trusted backend role, and these broad row predicates are
-- safe ONLY when the login itself is server-only and least privileged.
-- No role grants on public academic data or the managed auth schema.
CREATE POLICY alp_approval_executor_assignments_select
  ON alp_private.alp_role_assignments FOR SELECT TO alp_approval_executor
  USING (true);
CREATE POLICY alp_approval_executor_assignments_insert
  ON alp_private.alp_role_assignments FOR INSERT TO alp_approval_executor
  WITH CHECK (true);
CREATE POLICY alp_approval_executor_assignments_delete
  ON alp_private.alp_role_assignments FOR DELETE TO alp_approval_executor
  USING (true);

CREATE POLICY alp_approval_executor_audit_insert
  ON alp_private.alp_role_audit FOR INSERT TO alp_approval_executor
  WITH CHECK (true);
CREATE POLICY alp_approval_executor_requests_select
  ON alp_private.alp_role_requests FOR SELECT TO alp_approval_executor
  USING (true);
CREATE POLICY alp_approval_executor_requests_insert
  ON alp_private.alp_role_requests FOR INSERT TO alp_approval_executor
  WITH CHECK (true);
CREATE POLICY alp_approval_executor_requests_update
  ON alp_private.alp_role_requests FOR UPDATE TO alp_approval_executor
  USING (true) WITH CHECK (true);

CREATE POLICY alp_approval_executor_rate_select
  ON alp_private.alp_approval_rate_limits FOR SELECT TO alp_approval_executor
  USING (true);
CREATE POLICY alp_approval_executor_rate_insert
  ON alp_private.alp_approval_rate_limits FOR INSERT TO alp_approval_executor
  WITH CHECK (true);
CREATE POLICY alp_approval_executor_rate_update
  ON alp_private.alp_approval_rate_limits FOR UPDATE TO alp_approval_executor
  USING (true) WITH CHECK (true);
CREATE POLICY alp_approval_executor_event_insert
  ON alp_private.alp_security_events FOR INSERT TO alp_approval_executor
  WITH CHECK (event_name IN ('approval_rate_limited','approval_denied','approval_invalid_state'));

DO $check$
BEGIN
  IF has_schema_privilege('alp_approval_executor', 'auth', 'USAGE') OR
     has_table_privilege('alp_approval_executor', 'public.alp_courses', 'SELECT') OR
     (SELECT rolbypassrls OR rolsuper OR rolcanlogin FROM pg_roles
      WHERE rolname='alp_approval_executor') THEN
    RAISE EXCEPTION 'Approval executor privilege isolation failed';
  END IF;
END
$check$;

COMMIT;
