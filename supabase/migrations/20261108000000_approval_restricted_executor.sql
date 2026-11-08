-- R1 approval boundary: dedicated NOLOGIN executor with explicit entrypoint grants.
-- This role is NOT a database owner and cannot read/write protected tables directly.
-- Provision its NOINHERIT nonprivileged LOGIN and SET-only membership out of band.
-- The trusted backend must independently verify /auth/v1/user and derive actor IDs.
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

-- Ownership transfer requires CREATE on the target schema. Do not leave
-- this schema-wide privilege available to service_role after the transfer.
-- Abort if it was already present; never revoke a pre-existing privilege.
DO $schema_guard$
BEGIN
  IF has_schema_privilege('service_role','alp_private','CREATE') THEN
    RAISE EXCEPTION 'Unexpected preexisting service_role schema CREATE permission';
  END IF;
END
$schema_guard$;
GRANT CREATE ON SCHEMA alp_private TO service_role;

-- All four routines were previously SECURITY INVOKER, and all original
-- service_role grants on their dependent tables are retained. These controlled
-- entrypoints become SECURITY DEFINER owned by service_role (not postgres).
-- They already SET search_path='' and fully qualify private table references.
-- Never grant direct manage_role execution to the approval executor.
ALTER FUNCTION alp_private.submit_role_request(uuid,text,uuid,text)
  OWNER TO service_role;
ALTER FUNCTION alp_private.submit_role_request(uuid,text,uuid,text)
  SECURITY DEFINER;
ALTER FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
  OWNER TO service_role;
ALTER FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
  SECURITY DEFINER;
ALTER FUNCTION alp_private.consume_approval_quota(uuid)
  OWNER TO service_role;
ALTER FUNCTION alp_private.consume_approval_quota(uuid)
  SECURITY DEFINER;
ALTER FUNCTION alp_private.record_approval_security_event(uuid,text)
  OWNER TO service_role;
ALTER FUNCTION alp_private.record_approval_security_event(uuid,text)
  SECURITY DEFINER;

REVOKE CREATE ON SCHEMA alp_private FROM service_role;

GRANT EXECUTE ON FUNCTION alp_private.submit_role_request(uuid,text,uuid,text)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.decide_role_request(uuid,uuid,boolean,text)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.consume_approval_quota(uuid)
  TO alp_approval_executor;
GRANT EXECUTE ON FUNCTION alp_private.record_approval_security_event(uuid,text)
  TO alp_approval_executor;

-- This executor intentionally receives NO table grants, NO auth schema grants,
-- NO sequence grants and NO direct manage_role() execution. The API can only
-- reach the above four reviewed SECURITY DEFINER entrypoints.
DO $check$
DECLARE rec record;
BEGIN
  SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb INTO rec
  FROM pg_roles WHERE rolname='alp_approval_executor';
  IF rec.rolcanlogin OR rec.rolsuper OR rec.rolbypassrls OR
     rec.rolcreaterole OR rec.rolcreatedb OR
     has_schema_privilege('alp_approval_executor','auth','USAGE') OR
     has_table_privilege('alp_approval_executor','alp_private.alp_role_assignments','SELECT') OR
     has_table_privilege('alp_approval_executor','alp_private.alp_role_assignments','INSERT') OR
     has_table_privilege('alp_approval_executor','alp_private.alp_role_requests','UPDATE') OR
     has_table_privilege('alp_approval_executor','public.alp_courses','SELECT') OR
     has_function_privilege('alp_approval_executor',
       'alp_private.manage_role(uuid,text,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Approval executor privilege isolation failed';
  END IF;
END
$check$;

COMMIT;
