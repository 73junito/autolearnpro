BEGIN;
CREATE FUNCTION alp_private.security_event_alert_summary(p_window_minutes integer DEFAULT 60)
RETURNS TABLE(event_name text, event_count bigint, alert_needed boolean)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $body$
 SELECT e.event_name, count(*)::bigint,
 CASE WHEN e.event_name='approval_denied' THEN count(*)>=3
      WHEN e.event_name='approval_rate_limited' THEN count(*)>=2
      WHEN e.event_name='approval_invalid_state' THEN count(*)>=3
      ELSE false END
 FROM alp_private.alp_security_events e
 WHERE e.occurred_at >= clock_timestamp()-make_interval(mins=>p_window_minutes)
   AND p_window_minutes BETWEEN 1 AND 1440
 GROUP BY e.event_name
$body$;
REVOKE ALL ON FUNCTION alp_private.security_event_alert_summary(integer) FROM PUBLIC,anon,authenticated;
GRANT SELECT ON alp_private.alp_security_events TO service_role;
GRANT EXECUTE ON FUNCTION alp_private.security_event_alert_summary(integer) TO service_role;
COMMIT;
