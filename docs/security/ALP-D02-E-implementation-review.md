# ALP-D02-E — Migration Lineage and Workers Adapter Implementation Review

**Status:** SOURCE-ONLY IMPLEMENTATION / REVIEW HOLD
**Date:** November 18, 2026 (America/Chicago)
**Source baseline:** `main` at PR #13 merge `446846f603fe90d670982c041816875d40aa8a00`
**Worktree:** `F:\autolearnpro\_local\worktrees\d02e-workers-adapter`

## 1. Migration lineage: confirmed divergence

The hosted Supabase project `dmtnuvhzmgfavglyjwsl` remains the authoritative remote.
Its migration history has 23 entries, including
`20261114202924_worker_restricted_login_roles_passwordless`; this version
is **missing from the repository's migrations directory**.

The repository has 23 migration files, including
`20261119011728_approval_actor_attestation_boundary.sql`; that version is
**missing from the hosted database**. Matching counts therefore do not prove
equivalent histories.

Read-only hosted role-membership inspection showed
`alp_approval_worker_login -> alp_approval_executor` and
`alp_academic_worker_login -> alp_academic_executor`, with
`inherit_option=false` and `set_option=true`. These role memberships are
consistent with the hosted-only migration's name, but they do **not**
establish the original SQL text or migration checksum. The exact historical
migration file must be recovered from its authoritative source; do not
invent a replacement migration or mark history as applied without evidence.

The helper `infrastructure/scripts/compare-migration-lineage.mjs` reads a
**provided, non-secret JSON list** of remote migration versions and compares
it to local migration filenames. It exits nonzero on missing versions, name
mismatches or duplicates. It never connects to, applies, repairs or modifies
any database. Its tests prove equal counts with divergent IDs produce HOLD.

### Safe manual path

1. Recover the exact hosted-only `20261114202924` SQL from the original
   authoring branch, migration artifact or approved historical backup.
2. Examine the SQL for role ownership, grants, login permissions,
   idempotency, preconditions, and migration checksums; do not disclose
   credentials or raw secret materials.
3. Reconcile the two migration histories on a new disposable database that
   incorporates the hosted-only migration before D02-D.
4. Decide whether migration application is additive or requires a separate
   reviewed reconciliation migration. Never run `migration repair` as a
   shortcut without proving schema equivalence.
5. Update CI migration manifest expectations only after the source/history
   reconciliation has been completed and tested.

## 2. Cloudflare Workers approval adapter (not deployable)

Created `apps/web/src/approval-attestation-worker.mjs`, a Web Crypto
HMAC-SHA256 signer with byte-for-byte parity against the Node signer used
by the validated D02-D database functions.

Created `apps/web/src/worker-approval-adapter.mjs` exposing an isolated
`Request -> Response` handler with these properties:
- Verifies bearer token against GoTrue `/auth/v1/user`; actor UUID comes
  only from the returned verified user, not from body parameters.
- Refuses operation without a valid server-only attestation key and an
  injected restricted database transaction provider.
- Uses only parameterized signed approval RPC names for quota, submission,
  decision and security-event records.
- Limits body size, excludes unknown fields, keeps error details private,
  enforces independent quota commits and records denied actions.
- Has no Cloudflare route, secret binding, deployment manifest, direct PG
  connector, or production entrypoint.

**Required database adapter contract**:
`db.withTransaction(async tx => tx.query(sql, params))` must operate
using a restricted approval login, create a real transaction, and use
`SET LOCAL ROLE alp_approval_executor` inside that transaction.
This remains unimplemented pending verification of Workers-supported
PostgreSQL connectivity, binding isolation and Hyperdrive configuration.

The preexisting `autolearnpro-api-staging` Worker is research-bound and
must not be replaced. The `village-strong` Worker is completely OUT OF SCOPE.

## 3. Source validation

- D02-E synthetic tests: **11/11 PASS**, no skips.
- Combined runtime tests: **42/42 PASS**, no skips.
- `npm run lint:oxc`: zero warnings/errors.
- `npm run validate:foundation`: PASS.
- New D02-E files formatted using pinned `oxfmt` and verified.
- All tests are local with injected test database/auth interfaces. They do
  **not** prove a real Workers runtime database connection or hosted safety.

## 4. Required next review gates

**D02-E-A** Recover authoritative historical migration SQL and prove
combined-history disposable migration application without modifying hosted
Supabase. Produce read-only grants/function-diff evidence.

**D02-E-B** Build and verify a separate Workers PostgreSQL transaction
provider against a disposable test DB; perform integration tests with actual
GoTrue, RPC signatures, rate-limits, replay protection, and authenticated
user revocation. Confirm Node compatibility requirements.

**D02-E-C** Design independent secret provisioning, rotation and recovery.
The Worker signer secret is not a protection against compromise of the full
trusted signing runtime; database and signer secret exposure must remain
separate.

**D02-E-D** Institutional privacy/security review, RLS cross-user tests,
backups/restores, and cutover/rollback plan remain required.

## 5. Explicit decision

**Source-only development and review:** GO.
**Migration history remediation:** HOLD until verified original SQL recovered.
**Hosted Supabase writes:** HOLD.
**Cloudflare Workers/DNS/secret deployments:** HOLD.
**Institutional student-data onboarding:** NO-GO.
