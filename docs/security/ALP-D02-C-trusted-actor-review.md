# ALP-D02-C — Trusted Actor Boundary & Synthetic Negative-Test Plan

**Status:** DESIGN REVIEW / PRODUCTION NO-GO  
**Date:** 2026-11-18  
**Accountability:** Sole owner/operator; independent institutional acceptance remains unassigned  
**Change scope:** Documentation only. No schema, deployment, DNS, secrets, or production data mutations.

## Project scope boundary

This review is exclusively for **AutoLearnPro/TorqueMind**. The Cloudflare Worker named `village-strong` belongs to a separate project and is explicitly **OUT OF SCOPE**. Do not use, inspect further, modify, route traffic to, bind credentials from, or otherwise depend on `village-strong` for AutoLearnPro/TorqueMind. Its presence in the shared Cloudflare account is not evidence of AutoLearnPro architecture or deployment readiness.

Only AutoLearnPro/TorqueMind resources may be considered in this project's infrastructure inventory. The existing `autolearnpro-api-staging` Worker remains an AutoLearnPro candidate whose exact academic API role must be established before any changes.

## Evidence baseline (read-only, 2026-11-18)

- Source: `apps/web/src/role-approval.mjs` and `apps/web/src/academic.mjs` on `main`.
- Hosted Supabase project is active; four database roles exist: `alp_academic_executor`, `alp_approval_executor`, `alp_academic_worker_login`, `alp_approval_worker_login`.
- Executor roles: `NOLOGIN`, `NOINHERIT`, no `BYPASSRLS`, no `SUPERUSER`; corresponding worker logins have `LOGIN`, `NOINHERIT`, no `BYPASSRLS` or `SUPERUSER`.
- `alp_private` denies `USAGE` to `anon` and `authenticated`. Four advisor INFO findings involve private RLS tables without policies.
- The approval handler resolves actors through Supabase GoTrue `/auth/v1/user` and uses transaction-local `SET LOCAL ROLE alp_approval_executor`.
- `submit_role_request`, `decide_role_request`, `consume_approval_quota`, and `record_approval_security_event` are `SECURITY DEFINER` functions owned by `service_role`, callable by designated executor roles, not by `anon` or `authenticated`.
- These functions currently rely on caller-provided actor UUID arguments; an executor session can potentially supply an arbitrary actor UUID. An ordinary `set_config('request.jwt.claim.sub', ...)` is also caller writable and is **not** a trusted credential on its own.
- `decide_role_request` rejects self-approval and administrator elevation, and checks administrator role assignments. Its review-identity argument is not itself cryptographically bound to an authenticated caller.
- Cloudflare lists `autolearnpro-api-staging`; its mapping to academic foundation routes remains unverified. No academic API hostname mappings were found in the inspected account. The separate `village-strong` Worker is excluded from this project's scope and must not be used.

## Security invariant and threat boundary

**Invariant:** Authorization and attribution for privileged role changes must use an actor identity authenticated by a trusted enforcement boundary, not merely a UUID supplied in SQL arguments or a transaction setting the same database connection can forge.

### Trusted components / assumptions

1. Client bearer token is untrusted until GoTrue verifies it over TLS.
2. The server handler is trusted only when its runtime, deployment identity, and database credentials are appropriately protected.
3. A worker login can set arbitrary SQL parameters and transaction-local settings. Do **not** treat `request.jwt.claim.sub` as proof against a compromised worker connection.
4. A `SECURITY DEFINER` function owned by `service_role` must validate relevant invariants; restricting `EXECUTE` is necessary but not sufficient.
5. Role-administration identity, privileged-approval policy, and audit attribution require independent scrutiny before production acceptance.
6. Project ownership alone does not satisfy independent institutional security/privacy approval.

## Options and recommended sequence

**Option A — Immediate / test-first containment (recommended):** Keep existing privileged functions and grants unchanged while writing focused synthetic negative tests against the HTTP handlers and a disposable local database. Verify authenticated actor propagation, privilege denials, direct executor function invocation with a substituted actor, invalid/missing token handling, request state transitions, self-approval prevention, administrator elevation denial, and audit correctness. Treat any direct-DB actor-substitution success as an unresolved security finding, not a test to 'fix' by weakening assertions.

**Option B — Refactor to trusted identity enforcement (design required):** Select an auditable server-to-database trust mechanism resistant to arbitrary executor-session SQL. Possibilities include making all privileged role operations a tightly scoped broker operation with controls and audit outside the executor's discretionary inputs, or a verified signature/token checked inside a tightly scoped database function using an independent secret not available to the untrusted executor. Evaluate key rotation, replay, revocation, audit and separation of duties. Avoid claiming a SQL GUC comparison alone provides trusted actor binding.

**Option C — Reduce privilege surface:** Evaluate reducing or replacing `service_role` ownership of privileged functions, introducing narrower owners, tight `EXECUTE` grants, and independent request/decision security controls. Requires migrations and rollback planning; not authorized in this packet.

## D02-C synthetic negative-test matrix

| ID | Test | Expected result |
|---|---|---|
| C01 | Missing bearer token on role request/decision | 401, no approval mutation |
| C02 | Malformed bearer / GoTrue user lookup rejects token | 401, no SQL mutation |
| C03 | GoTrue unavailable or times out | 503, no SQL mutation |
| C04 | Supplied `actorId` or unauthorized fields in JSON | 400, never overrides verified actor |
| C05 | Valid bearer user A submits role request | Stored `requested_by` equals verified A |
| C06 | Valid bearer user B decides request | SQL reviewer parameter equals verified B |
| C07 | Self-approval or target approval | Denied, no role assignment |
| C08 | Non-admin reviewer decides a request | Denied, no role assignment |
| C09 | Approval of administrator elevation | Denied without independent approval gate |
| C10 | Seventh approval attempt within 60s | 429 with Retry-After; denied event recorded |
| C11 | Revoked GoTrue session | 401, no mutation (disposable local auth environment) |
| C12 | Direct executor invocation with substituted actor UUID | Record observed behavior; must not be accepted as verified attribution |
| C13 | Direct `anon`/`authenticated` access to private schema/functions | Denied |
| C14 | Transaction-local forged `request.jwt.claim.sub` | Must not be accepted as independent proof of identity |
| C15 | Database unavailable / nonprivileged-role checks fail | 503 fail closed, no SQL information leak |
| C16 | RLS policy cross-student and cross-instructor queries | No unauthorized rows or writes |

## Execution restrictions and evidence

- Tests involving SQL writes or authenticated sessions **must run only in disposable synthetic/local test infrastructure**, not the linked hosted project.
- Never run direct actor-substitution probes against institutional or real student accounts.
- Capture commit SHA, Node/npm versions, sanitized test output, migration IDs, database-role grants, and test environment identifiers. Do not log tokens, database connection strings, or student data.
- D02-C acceptance requires both a passing relevant negative-test suite and an explicit decision on the direct-executor trust model. Tests that reveal a gap are valid evidence, not grounds for silently weakening checks.
- Before altering AutoLearnPro routes or bindings, identify the exact role of `autolearnpro-api-staging`. Do not use `village-strong` for any part of this work.

## Release gates

**Development:** GO for source edits, offline synthetic tests, and evidence collection.  
**Database schema/privilege changes:** HOLD until a migration design, rollback, threat review and owner authorization.  
**Cloudflare/DNS/secret changes:** HOLD.  
**Institutional student-data onboarding and production:** NO-GO. Existing eight institutional blockers remain open.

## Follow-up action

Implement C01–C11/C15 as isolated, synthetic regression cases where existing tests do not already cover them. Scope C12–C14/C16 to disposable local integration environments. Submit independent, reviewable changes separate from C3 foundation remediation and PR #10; do not merge this design-only branch as production approval.
