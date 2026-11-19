# Foundation 7 — Private approval security events

Migration `20261026031245_approval_security_events.sql` creates `alp_private.alp_security_events` with forced RLS and a server-role-only write function. Events store verified actor UUID, an allowlisted event name, and server timestamp; no JWT, email, IP address, or client-supplied detail is retained.

The approval HTTP server records `approval_rate_limited` when a verified actor hits the shared quota, and `approval_denied` / `approval_invalid_state` for database permission and state violations after rollback. Event logging uses a separate transaction so denied operations are still recorded. The server does not expose SQL error details in responses. Unit tests: 3 passed. Live tests: 3 passed, including a direct database assertion of a denied-review event. Test events are cleaned up.

**Limitations:** This is security-event recording, not an operational alerting system. Monitoring queries, alert thresholds/delivery, retention/cleanup, and automated escalation have not been configured. Invalid/anonymous JWTs are not recorded in this authenticated event table. Cloud deployment is blocked pending further review.
