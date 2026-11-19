# ALP-D02-E-R7 — Actual Cloudflare workerd Source-Only Runtime Gate

**State:** Disposable Cloudflare workerd source-only CI; no deployment authority.
**Base:** main after R6 real GoTrue revocation PR #24.
**Runtime:** Cloudflare Miniflare 4 (local workerd), pinned in package-lock.
**Target:** Cloudflare Workers only. Not Vercel/Pages.

## Security boundary

The new `apps/web/src/worker-approval-entrypoint.mjs` is a
Cloudflare module Worker that composes the existing R3B restricted
session broker, R2 PostgreSQL transaction provider and R3C Worker
approval adapter. Its inputs come **only** from explicit Worker
bindings:
- `SUPABASE_AUTH_URL`: HTTPS GoTrue URL (loopback HTTP permitted for
  local testing only), with no URL userinfo, query or fragment.
- `SUPABASE_PUBLISHABLE_KEY`: public Auth API key.
- `APPROVAL_ATTESTATION_KEY`: 64-character hex HMAC key as a secret
  binding, not source or global process.env.
- `APPROVAL_HYPERDRIVE.connectionString`: Cloudflare Hyperdrive binding.
  The PostgreSQL URL must explicitly authenticate as
  `alp_approval_worker_login`, never postgres or service_role.

Any omitted, malformed, overprivileged, or unconfigured binding
produces HTTP 503 with `cache-control: no-store`. Configured
requests still pass through verified bearer auth and restricted
transaction/session checks; absent bearer returns HTTP 401.

## Actual execution gate

The R7 CI job executes this module in a **real local workerd process**
via pinned Miniflare, not only Node.js or a mocked Request handler.
An esbuild bundle is created in a temporary directory inside the
repository, never published, then deleted.

The checks require:
1. Missing bindings fail closed (503).
2. Invalid signing secret fails closed (503).
3. A Hyperdrive binding with the restricted login but no reachable
   database still cannot bypass bearer validation (401).
4. Database-owner credentials are rejected even when the HMAC secret is otherwise valid.
5. Neither errors nor headers reveal internal credentials.

The package's compatibility date is 2026-08-06 with
`nodejs_compat`; the tested `pg` dependency is 8.16.3.

## Unproven gates (do not infer completion)

The local Miniflare tests do **not** prove the Hyperdrive PostgreSQL
transport can execute transactions from workerd, nor prove real
Cloudflare-hosted binding provisioning, TLS trust, production egress,
secret rotation, signing-key lifecycle in a deployed Worker, or
runtime-based integration with real GoTrue. The R2/R3C/R6 real
PostgreSQL + GoTrue validation still runs separately in disposable
Supabase CI, but is not yet exercised end-to-end *inside workerd*.

A follow-on source-only test must exercise the actual restricted
Hyperdrive socket under workerd with a disposable PostgreSQL server
before proposing any production deployment. A full production
readiness review also requires dependency provenance, RTO/RPO
recovery, and explicit infrastructure authorization.

No Cloudflare account routes, DNS, worker secrets or hosted
Supabase tables are read or modified.

**Source-only workerd smoke gate:** GO.
**Actual Hyperdrive transport gate:** NOT VERIFIED.
**Hosted migration or Cloudflare deployment:** HOLD.
**Student production onboarding:** NO-GO.

References:
- https://developers.cloudflare.com/workers/testing/miniflare/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/
