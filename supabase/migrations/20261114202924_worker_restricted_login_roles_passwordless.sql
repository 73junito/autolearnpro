BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('alp_academic_worker_login','alp_approval_worker_login')) THEN
  RAISE EXCEPTION 'Worker login role already exists; refusing partial provisioning';
 END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('alp_academic_executor','alp_approval_executor') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) <> 2 THEN
  RAISE EXCEPTION 'Restricted executor precondition failed';
 END IF;
END $$;
CREATE ROLE alp_academic_worker_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL;
CREATE ROLE alp_approval_worker_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL;
GRANT alp_academic_executor TO alp_academic_worker_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT alp_approval_executor TO alp_approval_worker_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
  WHERE child.rolname IN ('alp_academic_worker_login','alp_approval_worker_login')
    AND (m.admin_option OR m.inherit_option OR NOT m.set_option OR
      (child.rolname='alp_academic_worker_login' AND parent.rolname<>'alp_academic_executor') OR
      (child.rolname='alp_approval_worker_login' AND parent.rolname<>'alp_approval_executor'))
 ) THEN RAISE EXCEPTION 'Worker role membership isolation failed'; END IF;
END $$;
COMMIT;