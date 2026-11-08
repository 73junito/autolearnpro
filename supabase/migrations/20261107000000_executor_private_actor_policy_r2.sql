-- Proposed additive R1 executor-only identity-policy migration. REVIEW REQUIRED.
-- Preserve the preceding 20 migration files and apply only in their correct ordered sequence.
BEGIN;
DO $gate$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations;
  IF n<>20 THEN
    RAISE EXCEPTION 'Expected exactly 20 baseline migrations before R1 policy migration';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
  WHERE 'alp_academic_executor'=ANY(roles) AND 'authenticated'=ANY(roles)
    AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%');
  IF n<>23 THEN RAISE EXCEPTION 'Expected 23 shared auth-dependent policies; found %',n; END IF;
  SELECT count(*) INTO n FROM pg_policies
  WHERE 'alp_academic_executor'=ANY(roles) AND NOT 'authenticated'=ANY(roles)
    AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%');
  IF n<>4 THEN RAISE EXCEPTION 'Expected 4 executor-only auth-dependent policies; found %',n; END IF;
END $gate$;

CREATE OR REPLACE FUNCTION alp_private.alp_request_actor()
RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $actor$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$actor$;
REVOKE ALL ON FUNCTION alp_private.alp_request_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION alp_private.alp_request_actor() TO alp_academic_executor;

DO $migrate$
DECLARE p record; pred text; newname text; new_qual text; new_check text;
BEGIN
 FOR p IN
 SELECT * FROM pg_policies
 WHERE 'alp_academic_executor'=ANY(roles)
   AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
 ORDER BY schemaname,tablename,policyname
 LOOP
  new_qual:=replace(p.qual,'auth.uid()','alp_private.alp_request_actor()');
  new_check:=replace(p.with_check,'auth.uid()','alp_private.alp_request_actor()');
  IF 'authenticated'=ANY(p.roles) THEN
    newname:=p.policyname||'_exec_r2';
    IF length(newname)>63 THEN RAISE EXCEPTION 'Policy name overflow: %',newname; END IF;
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',p.policyname,p.schemaname,p.tablename);
    pred:='';
    IF new_qual IS NOT NULL THEN pred:=pred||format(' USING (%s)',new_qual); END IF;
    IF new_check IS NOT NULL THEN pred:=pred||format(' WITH CHECK (%s)',new_check); END IF;
    EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO alp_academic_executor%s',
      newname,p.schemaname,p.tablename,p.permissive,p.cmd,pred);
  ELSE
    pred:='';
    IF new_qual IS NOT NULL THEN pred:=pred||format(' USING (%s)',new_qual); END IF;
    IF new_check IS NOT NULL THEN pred:=pred||format(' WITH CHECK (%s)',new_check); END IF;
    EXECUTE format('ALTER POLICY %I ON %I.%I TO alp_academic_executor%s',
      p.policyname,p.schemaname,p.tablename,pred);
  END IF;
 END LOOP;
END $migrate$;

CREATE OR REPLACE FUNCTION alp_private.alp_current_actor()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $actor$ SELECT alp_private.alp_request_actor() $actor$;
REVOKE ALL ON FUNCTION alp_private.alp_current_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION alp_private.alp_current_actor() TO alp_academic_executor;

-- Prove the executor does not require managed auth schema access.
-- The preceding normal migration must not grant this schema USAGE; fail rather than alter owner-managed auth ACL.
DO $verify$
DECLARE n integer;
BEGIN
 IF has_schema_privilege('alp_academic_executor','auth','USAGE')
   THEN RAISE EXCEPTION 'Executor still has auth schema USAGE'; END IF;
 SELECT count(*) INTO n FROM pg_policies
 WHERE 'alp_academic_executor'=ANY(roles)
   AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%');
 IF n<>0 THEN RAISE EXCEPTION 'Auth-dependent executor policies remain: %',n; END IF;
 SELECT count(*) INTO n FROM pg_policies WHERE policyname LIKE '%_exec_r2';
 IF n<>23 THEN RAISE EXCEPTION 'Expected 23 executor policy copies, found %',n; END IF;
END $verify$;
COMMIT;
