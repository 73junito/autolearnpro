# ALP-D02-E-R2 — Restricted Workers/PostgreSQL Transaction Provider

**State:** SOURCE-ONLY DEVELOPMENT / REVIEW HOLD
**Scope:** AutoLearnPro approval API; isolated worktree under `F:\autolearnpro`
**Baseline:** `main` after merge of D02-E-R1 PR #16

## Provider contract

New `apps/web/src/worker-approval-postgres.mjs` implements the
`db.withTransaction(async tx => tx.query(sql, params))` contract used by
`worker-approval-adapter.mjs`. The provider uses pinned `pg@8.16.3` and is
designed for a Workers environment with `nodejs_compat` and a separately
approved Hyperdrive binding. **No deployable Worker entrypoint or Hyperdrive
configuration is introduced by this change.**

Every transaction creates a new PostgreSQL client, issues `BEGIN`,
`SET LOCAL ROLE alp_approval_executor`, then independently checks that
`session_user = alp_approval_worker_login` and
`current_user = alp_approval_executor` **before** running the callback.
A different login (even a privileged one) is rejected, rolled back and
closed. Each completed callback is committed before the client is discarded.
Failed callbacks, SQL errors and failed commits trigger rollback. Cleanup
failure is not silently treated as success. Callbacks cannot issue queries
after the transaction has been closed.

This is *not* an authorization substitute for verifying a human user's GoTrue
identity. That verification and D02-D signed-RPC proof generation remain in
the separate approval request handler and PostgreSQL migration.

## Disposable verification

The existing CI database setup now temporarily grants a **random CI-only
password** to the already migrated `alp_approval_worker_login` role on its
fresh disposable database, runs a dedicated real PostgreSQL transaction test
using that exact login, and restores the historical role to `PASSWORD NULL`
in a `finally` block. The disposable database is then discarded.

The new live test rejects non-loopback connections, an unexpected port,
non-disposable database names, and any login other than
`alp_approval_worker_login`. It verifies executor identity, direct
`auth.users` denial, rejection of unsigned approval RPCs, rollback after
application errors, and repeat transactions after failure.

The local unit suite exercises identity mismatch, privileged-login
substitution, query failure, failed commit, cleanup failure, stale
transactions, nonparameterized queries and client isolation.

## Production blockers remain

1. The hosted Supabase passwordless approval login cannot authenticate to
   a conventional password-based Hyperdrive connection without a separately
   approved credential provisioning design or authenticated broker.
2. The Worker entrypoint, Hyperdrive binding configuration and route do not
   yet exist and must be tested with actual Cloudflare Workers runtime
   semantics, not only Node.js and PostgreSQL.
3. Live GoTrue session-revocation and end-to-end HMAC tests, backup/restore
   rehearsal, secret rotation, and institutional review are not complete.
4. Hosted D02-D signed approval migration remains unapplied, so production
   unsigned executor grants remain a known vulnerability.

No hosted Supabase writes, Cloudflare deployment, route, secret or DNS change
is authorized by this source-only work. The existing research Worker,
`village-strong` and protected C3 workstream remain excluded.

**Development:** GO. **Production:** NO-GO.
