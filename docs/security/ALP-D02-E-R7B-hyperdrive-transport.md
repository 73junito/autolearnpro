# D02-E-R7B — Disposable workerd-to-PostgreSQL Hyperdrive Transport Proof

**Scope:** Source-only real workerd test with a disposable local Supabase instance.
**Base:** PR #25 merged into main. No hosted credentials, Cloudflare deployments, or production actions.

The R7 Worker startup smoke test previously demonstrated fail-closed bindings, but did not open a PostgreSQL socket from workerd. R7B adds a test-only, fixed-operation Worker fixture in `tests/fixtures` and a CI test executed after R2 has provisioned a temporary password for `alp_approval_worker_login`, and before R3D rotates the temporary signing key.

## Required live proof

1. Only a GitHub CI process, the exact `autolearnpro-foundation6` project, loopback PostgreSQL on port 55132, and a disposable marker are allowed.
2. The test bundles its fixture with pinned esbuild, runs it in pinned local Miniflare/Cloudflare `workerd` with `nodejs_compat` and compatible date 2026-08-06.
3. The Hyperdrive local proxy binds **only** `alp_approval_worker_login`, never `postgres` or `service_role`.
4. An actual SQL transaction identifies session_user as `alp_approval_worker_login` and current_user as `alp_approval_executor`.
5. Direct SELECT on `auth.sessions` is denied under the restricted executor.
6. A signed quota call commits and increments the private approval throttle exactly once.
7. Another signed quota call raises a deliberate error and rolls back without modifying the count.
8. The restricted R3B session broker observes a live session before revocation and denies it after real PostgreSQL session deletion.
9. Disposable user, nonce, quota and session fixtures are removed. The temporary bundle and database are destroyed after CI. Test material never leaves CI.

The **test-only fixture is not deployed**, accepts only predeclared operations, and must never be imported by the production Worker entrypoint. It uses a special isolated CI binding guard. Tests do not implement untrusted SQL execution.

## Explicit exclusions

A passing local Hyperdrive proxy test is still **not** evidence of Cloudflare-hosted Hyperdrive TLS, remote network path, production secrets, production GoTrue, rate-limit/concurrency performance, or authorization for live release. R6 separately tests actual GoTrue login/logout. R4/R5 separately test recovery readiness; full managed Supabase recovery remains unverified.

Cloudflare guidance: node-postgres 8.16.3 is supported for Hyperdrive with `nodejs_compat`. Transaction pooling can constrain session-level features, so this test requires explicit `SET LOCAL ROLE` inside each transaction, not a persistent session role.

References: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/ and https://developers.cloudflare.com/hyperdrive/configuration/local-development/

**Source-only R7B GO after green CI. Hosted Supabase and Cloudflare deployment HOLD. Production onboarding NO-GO.**
