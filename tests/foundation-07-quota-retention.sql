\set ON_ERROR_STOP on
BEGIN;
INSERT INTO alp_private.alp_approval_rate_limits(actor_id,window_started,attempts) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '25 hours',2),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()-interval '1 hour',2);
DO $check$
BEGIN
 IF has_function_privilege('authenticated','alp_private.prune_approval_quota(integer)','EXECUTE') THEN
 RAISE EXCEPTION 'regular client can prune quotas'; END IF;
END $check$;
SET LOCAL ROLE service_role;
DO $check$
DECLARE removed integer;
BEGIN
 SELECT alp_private.prune_approval_quota(100) INTO removed;
 IF removed <> 1 THEN RAISE EXCEPTION 'unexpected cleanup count %', removed; END IF;
END $check$;
RESET ROLE;
DO $check$
BEGIN
 IF (SELECT count(*) FROM alp_private.alp_approval_rate_limits WHERE actor_id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))<>1 THEN
 RAISE EXCEPTION 'unexpired quota removed'; END IF;
END $check$;
ROLLBACK;
\echo QUOTA_RETENTION_PASSED
