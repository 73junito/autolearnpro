# Foundation 7 — Shared PostgreSQL approval throttle

Migration: `20261026024626_persistent_approval_throttle.sql`. Introduces a private, RLS-forced `alp_private.alp_approval_rate_limits` table and a `SECURITY INVOKER` quota function that only the trusted server's `service_role` may execute. PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` serializes actor-based quota consumption across concurrent application instances using the same database.

The Node approval HTTP handler checks the Auth-issued actor identity and consumes a quota token in its own committed transaction before processing the request body. Six requests in a rolling 60-second fixed window are permitted; subsequent requests return HTTP 429 and `Retry-After: 60`. If the database/quota check fails, the endpoint returns HTTP 503 and performs no role mutation. Denied or malformed requests from verified identities consume quota because the quota transaction commits separately.

`tests/approval-shared-quota-live.test.mjs` verified that alternating between two independent local PostgreSQL connections shares the same counter: six accepted, seventh rejected. Temporary quota entries were deleted. The prior mocked HTTP throttle test and full Node suite were also updated. Local integration runs require `ALP_LOCAL_INTEGRATION=1` and local DB/Auth settings; avoid logging credentials.

Outstanding release work: retention cleanup of expired quota rows, network-layer protections for unauthenticated traffic, rate-limit policy review, review of session invalidation and audit alerting, clean migration replay, TLS/deployment security, and privileged administrator elevation. This does not constitute production deployment; Supabase cloud and legacy projects remain unchanged.
