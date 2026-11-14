-- R1 restricted academic executor: additive grants and explicitly scoped RLS policies.
-- Apply ONLY to an independently marked, disposable scratch database for validation.
-- A dedicated server-only LOGIN role must be provisioned out of band and granted
-- membership in alp_academic_executor; never expose that login to clients.
BEGIN;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'alp_academic_executor' AND NOT rolcanlogin
      AND NOT rolbypassrls AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  ) THEN
    RAISE EXCEPTION 'R1 restricted executor role absent or unsafe';
  END IF;
END
$check$;

GRANT USAGE ON SCHEMA public, alp_private, auth TO alp_academic_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO alp_academic_executor;
-- Every academic table uses FORCE ROW LEVEL SECURITY.
GRANT SELECT, INSERT ON public.alp_courses TO alp_academic_executor;
GRANT SELECT, INSERT ON public.alp_enrollments TO alp_academic_executor;
GRANT SELECT ON public.alp_lessons TO alp_academic_executor;
GRANT SELECT ON public.alp_learning_pathways TO alp_academic_executor;
GRANT SELECT ON public.alp_pathway_courses TO alp_academic_executor;
GRANT SELECT, UPDATE (status) ON public.alp_academic_progress TO alp_academic_executor;

-- Policy predicates read the caller's *own* instructor membership.
-- Do not expose all role assignments or role-management functions.
GRANT SELECT (user_id, role_name) ON alp_private.alp_role_assignments TO alp_academic_executor;
CREATE POLICY alp_academic_executor_role_self_read
  ON alp_private.alp_role_assignments FOR SELECT TO alp_academic_executor
  USING (user_id = (SELECT auth.uid()));

-- Existing academic policies use auth.uid() and apply to authenticated only.
-- Extend the same row predicates to the non-inheriting restricted API executor,
-- preserving existing authenticated policy definitions without broadening PUBLIC.
DO $extend$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'alp_courses', 'alp_enrollments', 'alp_lessons',
        'alp_learning_pathways', 'alp_pathway_courses', 'alp_academic_progress'
      )
      AND 'authenticated' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated, alp_academic_executor',
                   p.policyname, p.schemaname, p.tablename);
  END LOOP;
END
$extend$;

-- In the earlier hardening migration the broad instructor FOR ALL policy
-- was dropped. Restore explicit owner SELECT, including unpublished courses.
CREATE POLICY alp_academic_executor_course_owner_read
  ON public.alp_courses FOR SELECT TO alp_academic_executor
  USING (
    instructor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = alp_courses.instructor_id AND ra.role_name = 'instructor'
    )
  );

-- The quota function is SECURITY INVOKER; its table must have actor-scoped RLS.
GRANT SELECT, INSERT, UPDATE ON alp_private.alp_academic_rate_limits TO alp_academic_executor;
CREATE POLICY alp_academic_executor_quota_own
  ON alp_private.alp_academic_rate_limits FOR ALL TO alp_academic_executor
  USING (actor_id = (SELECT auth.uid()))
  WITH CHECK (actor_id = (SELECT auth.uid()));
GRANT EXECUTE ON FUNCTION alp_private.consume_academic_quota(uuid, text, integer)
  TO alp_academic_executor;

-- The existing denial path emits a server-side security event. Allow only its
-- own actor's approval_denied event, not reads or deletion of audit history.
GRANT INSERT (actor_id, event_name) ON alp_private.alp_security_events TO alp_academic_executor;
GRANT USAGE ON SEQUENCE alp_private.alp_security_events_id_seq TO alp_academic_executor;
CREATE POLICY alp_academic_executor_denial_event
  ON alp_private.alp_security_events FOR INSERT TO alp_academic_executor
  WITH CHECK (actor_id = (SELECT auth.uid()) AND event_name = 'approval_denied');
GRANT EXECUTE ON FUNCTION alp_private.record_approval_security_event(uuid, text)
  TO alp_academic_executor;

-- Convenience identity introspection for R1 tests. It uses auth.uid(), exactly
-- the value tested by the academic policies, not an independently writable GUC.
CREATE FUNCTION alp_private.alp_current_actor()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $actor$
  SELECT auth.uid()
$actor$;
REVOKE ALL ON FUNCTION alp_private.alp_current_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION alp_private.alp_current_actor() TO alp_academic_executor;

COMMIT;
