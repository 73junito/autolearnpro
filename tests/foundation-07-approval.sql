\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO alp_private.alp_role_assignments(user_id,role_name)
 VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','administrator');
DO $test$
BEGIN
 IF has_function_privilege('authenticated','alp_private.decide_role_request(uuid,uuid,boolean,text)','EXECUTE') THEN
   RAISE EXCEPTION 'untrusted role may approve';
 END IF;
 IF has_table_privilege('authenticated','alp_private.alp_role_requests','SELECT') THEN
   RAISE EXCEPTION 'untrusted role may inspect requests';
 END IF;
END $test$;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE approval_test_ids(id uuid);
INSERT INTO approval_test_ids
 SELECT alp_private.submit_role_request(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','instructor',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','request for instructor status');
DO $test$
DECLARE r uuid;
BEGIN
 SELECT id INTO r FROM approval_test_ids;
 BEGIN
  PERFORM alp_private.decide_role_request(r,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'self-approval attempt');
  RAISE EXCEPTION 'self approval incorrectly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM alp_private.decide_role_request(r,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'target cannot approve');
  RAISE EXCEPTION 'target approval incorrectly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM alp_private.decide_role_request(r,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false,'reject without reviewer privileges');
  RAISE EXCEPTION 'unprivileged reviewer incorrectly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM alp_private.decide_role_request(r,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,'reviewed credentials and approved');
 BEGIN
  PERFORM alp_private.decide_role_request(r,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,'duplicated approval attempt');
  RAISE EXCEPTION 'duplicate approval incorrectly permitted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $test$;
RESET ROLE;
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM alp_private.alp_role_assignments
 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND role_name='instructor';
 IF n<>1 THEN RAISE EXCEPTION 'approved role not assigned'; END IF;
 SELECT count(*) INTO n FROM alp_private.alp_role_audit WHERE action='grant' AND role_name='instructor';
 IF n<>1 THEN RAISE EXCEPTION 'missing role assignment audit'; END IF;
 SELECT count(*) INTO n FROM alp_private.alp_role_requests WHERE state='approved';
 IF n<>1 THEN RAISE EXCEPTION 'approval request not recorded'; END IF;
END $test$;
ROLLBACK;
\echo FOUNDATION_07_APPROVAL_WORKFLOW_PASSED