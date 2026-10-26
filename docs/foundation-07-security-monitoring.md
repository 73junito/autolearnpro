# Foundation 7 — private monitoring threshold summary

Migration: `20261026031531_security_event_monitoring.sql`.

The private, SECURITY INVOKER function `alp_private.security_event_alert_summary(p_window_minutes integer default 60)` aggregates recent security events from the private event table. Only `service_role` may execute it; clients have no schema/function access. A limited SELECT grant on the private event table enables this internal aggregate. Default window: 60 minutes; accepted range: 1–1440 minutes.

Local preliminary alert thresholds per selected window: `approval_denied` at 3 events; `approval_rate_limited` at 2; `approval_invalid_state` at 3. These are initial engineering defaults, not operationally approved thresholds. The rollback-only test `tests/foundation-07-alert-summary.sql` seeded 5 events and verified two alert categories and client-function denial.

**Scope:** This prepares alert *detection*, not alert delivery. There is no scheduler, notifier, on-call escalation, email, dashboard, alert acknowledgement, deduplication, or maintenance automation configured. Production deployment and GitHub push remain on hold. A separate authenticated, minimal-privilege monitoring worker should execute the aggregate and deliver alerts to an approved destination with rate controls and monitoring of its own failures.
