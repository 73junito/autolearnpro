# Foundation 7 — persistent quota retention

Migration `20261026025131_approval_quota_retention.sql` adds a private, `SECURITY INVOKER` cleanup function. A trusted server role may remove up to 10,000 rate-limit rows per invocation where the quota window began over 24 hours ago. The function uses `FOR UPDATE SKIP LOCKED` and is not callable by `anon` or `authenticated`. It is designed to be invoked by a future scheduled trusted maintenance job; no recurring job has been scheduled.

`tests/foundation-07-quota-retention.sql` uses rollback-only fixtures to verify expired rows are deleted, recent rows preserved, and authenticated clients cannot execute cleanup.

Local Supabase clean-reset first failed during container schema initialization; the retry completed successfully with all seven migrations, and the migration history now matches local files. The retention SQL test passed again after the reset. `npm test`: 3/3 passed. No remote Supabase or legacy environment was changed.

Release gates: schedule and monitor bounded cleanup, run live approval integration against newly replayed database, test session revocation, security audit alerting, and administrator elevation safeguards. Keep production deployment blocked pending review.
