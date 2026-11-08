\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
DO $test$
BEGIN
 IF has_function_privilege('authenticated','alp_private.manage_role(uuid,text,text,uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'authenticated can execute role manager';
 END IF;
 IF has_schema_privilege('authenticated','alp_private','USAGE') THEN
   RAISE EXCEPTION 'authenticated can access private schema';
 END IF;
 IF has_table_privilege('authenticated','alp_private.alp_role_assignments','INSERT') THEN
   RAISE EXCEPTION 'authenticated can directly assign roles';
 END IF;
END
$test$;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM alp_private.manage_role(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','administrator','grant',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','unauthorized request');
    RAISE EXCEPTION 'privilege elevation succeeded unexpectedly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT alp_private.manage_role(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','instructor','grant',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approved instructor appointment');
RESET ROLE;
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM alp_private.alp_role_assignments WHERE role_name='instructor';
 IF n <> 1 THEN RAISE EXCEPTION 'trusted role grant absent'; END IF;
 SELECT count(*) INTO n FROM alp_private.alp_role_audit WHERE action='grant';
 IF n <> 1 THEN RAISE EXCEPTION 'role grant audit absent'; END IF;
END
$test$;
SET LOCAL ROLE service_role;
SELECT alp_private.manage_role(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','instructor','revoke',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','revoked after local test');
RESET ROLE;
RESET ROLE;
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM alp_private.alp_role_assignments;
 IF n <> 0 THEN RAISE EXCEPTION 'revoke failed'; END IF;
 SELECT count(*) INTO n FROM alp_private.alp_role_audit;
 IF n <> 2 THEN RAISE EXCEPTION 'grant/revoke audit count unexpected'; END IF;
END
$test$;
ROLLBACK;
\echo FOUNDATION_07_TRUSTED_ROLE_MANAGEMENT_PASSED
