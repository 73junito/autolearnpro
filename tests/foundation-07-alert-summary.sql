\set ON_ERROR_STOP on
BEGIN;
INSERT INTO alp_private.alp_security_events(actor_id,event_name) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approval_denied'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approval_denied'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approval_denied'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approval_rate_limited'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','approval_rate_limited');
DO $check$ BEGIN
 IF has_function_privilege('authenticated','alp_private.security_event_alert_summary(integer)','EXECUTE') THEN
 RAISE EXCEPTION 'summary public'; END IF;
END $check$;
SET LOCAL ROLE service_role;
DO $check$ DECLARE found_count integer; BEGIN
 SELECT count(*) INTO found_count FROM alp_private.security_event_alert_summary(60) WHERE alert_needed;
 IF found_count <> 2 THEN RAISE EXCEPTION 'expected two alert classes, got %', found_count; END IF;
END $check$;
RESET ROLE;
ROLLBACK;
\echo SECURITY_ALERT_SUMMARY_PASSED
