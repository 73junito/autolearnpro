# ALP-D02-E — Hosted Supabase and Cloudflare Workers Cutover Decision Packet

**Status:** DESIGN REVIEW / EXECUTION HOLD  
**Scope:** AutoLearnPro/TorqueMind only  
**Decision owner:** Sole human owner/architect/operator  
**Prepared:** 2026-11-18 (America/Chicago)  
**Repository baseline:** `main` after PR #13, merge `446846f603fe90d670982c041816875d40aa8a00`

## 1. Verified evidence (read-only)

- Hosted Supabase: `dmtnuvhzmgfavglyjwsl` (`autolearnpro.com`), PostgreSQL 17.11, `ACTIVE_HEALTHY`.
- Hosted migration history has **23 entries**, but the last hosted migration is **`20261114202924_worker_restricted_login_roles_passwordless`**, while the repo includes **`20261119011728_approval_actor_attestation_boundary.sql`** as its 23rd local migration. These histories are NOT equivalent. Preserve both and reconcile migration provenance and ordering before any deployment.
- Hosted `alp_private.alp_approval_attestation_keys` table and `alp_private.submit_role_request_signed(...)` function are absent; D02-D has **not** been applied.
- Hosted `alp_approval_executor` still has `EXECUTE` privileges on the original unsigned `submit_role_request`, `decide_role_request`, `consume_approval_quota`, and `record_approval_security_event` functions. **Hosted actor spoofing weakness remains open.** Do not infer security from green disposable CI.
- Supabase Security Advisor: four private tables marked `rls_enabled_no_policy` (information-level findings); investigate via grants and effective access, not by blindly creating policies.
- Cloudflare account inventory exposes a Worker named `autolearnpro-api-staging`; current binding *names/types* are `ENVIRONMENT` (plain text), `RESEARCH_COORDINATOR` (Durable Object), `RESEARCH_SCOPES`, `SEMANTIC_SCHOLAR_API_KEY`, and `STAGING_API_TOKEN` (secrets). No approval database or attestation bindings were established by this inventory. Its research role must not be replaced or conflated with academic approval routing.
- `apps/web/src/server.mjs` uses `node:http` and `apps/web/package.json` depends on `pg`; this is an existing Node server, **not a verified Cloudflare Workers deployment artifact**.
- The merged PR #13 GitHub Actions run passed 31/31 runtime tests, 15/15 academic unit tests, 3/3 academic database tests, and 1/1 approval database test, using a **fresh disposable** Supabase instance with the repo's ordered 23 migrations.
- Separate `village-strong` Worker is categorically **OUT OF SCOPE**; do not inventory further, bind, route, alter, or depend on it.

## 2. Hard deployment blockers

| ID | Blocker | Required evidence before a change |
| --- | --- | --- |
| E01 | Hosted migration lineage diverges from repository | Record SQL and checksum/provenance of hosted `20261114202924`, check whether corresponding repo migration exists, and create a reviewed, additive reconciliation migration; verify on a **new disposable snapshot** without rewriting history |
| E02 | Hosted unsigned approval RPCs remain callable by restricted executor | Apply only an approved reconciled migration during a controlled cutover; then verify original EXECUTE grants are revoked and signed RPCs exist |
| E03 | No hosted signer key provisioned | Design separate, controlled generation, transfer and rotation; secret must never appear in source, Git history, logs, chat, plaintext client bindings, or unaudited SQL |
| E04 | No verified approval API Cloudflare Worker implementation | Implement a separate Workers-compatible fetch adapter and database connectivity architecture; preserve research staging Worker, no Node `http.createServer` assumption |
| E05 | No pre-flight dependency and backward compatibility gate | Decide whether to freeze approval writes, use maintenance mode, or migrate a separately isolated environment; stop if old instances could call revoked functions |
| E06 | No demonstrated production rollback or restore | Backup/PITR eligibility, tested restore, recovery point, secret lifecycle and forward-fix plan; do not regrant unsigned RPCs as rollback |
| E07 | Residual identity and governance gaps | Session revocation freshness, key rotation, nonce cleanup, academic audit actor identity, institutional privacy and required independent reviews |
| E08 | RLS adviser findings unresolved | Confirm direct privileges on four private RLS tables and policy intent; do not mistake an informational advisor for confirmed exposure |

## 3. Proposed deployment architecture

**A. Dedicated approval API Worker.** Build a Workers-native `fetch(request, env, ctx)` handler using the verified GoTrue user lookup and a Workers-compatible signing primitive. No direct reuse of the Node HTTP server or an unverified `pg` connection pool in Worker runtime. Decide on a *separately verified* restricted database access path supported by Workers (for example a supported PostgreSQL client/connection broker or Hyperdrive where appropriate); never put a database-owner credential into Worker bindings.

**B. Limited actor-signing boundary.** Keep the HMAC secret server-only, scoped to the approval Worker/service and the database verification store. The HMAC protects against compromise of a DB-only executor without the signer secret; it **does not** protect against full compromise of the signer runtime. Validate key rotation, parallel key period, nonce-retention and atomic replay behavior before deployment.

**C. Auth and authorization.** Every request must be independently verified via GoTrue, with denial of spoofed actors and invalid sessions. Require real integration tests for self-approval denial, unauthorized reviewer denial, administrator elevation denial, session revocation, rate limiting, audit attribution and cross-user RLS. Add deployed Worker route/hostname review before touching routing.

**D. Isolation.** The research-bound `autolearnpro-api-staging` Worker remains unchanged. Do not create or modify Cloudflare Workers, secrets, DNS, routes or environments from this decision packet.

## 4. Proposed staged execution (NOT authorization)

1. **Read-only evidence and migration reconciliation.** Record linked migration history, compare hashes against each repository migration, inspect the hosted-only passwordless-login migration, verify effective role grants and ownership. Any new migration must be created using current Supabase CLI conventions and peer-reviewed.
2. **Workers-compatible adapter in source only.** Create a separate isolated branch and tests for Cloudflare request/response shapes, Web Crypto HMAC parity, failure handling, database-driver behavior, and no confidential data in responses. Do not deploy.
3. **Disposable integration.** Construct a fresh *combined-history* disposable database including the hosted-only login migration **and** the D02-D signed-RPC migration. Test expected failure modes, privilege revocation, 32-byte signing key parity, key compromise boundary, replay, throttling, and audit.
4. **Recovery proof.** Confirm authoritative backup, restore target, RTO/RPO, maintenance-window plan, reversible application traffic isolation, and safe forward-fix strategy. Never use a production rollback that reintroduces the actor-spoofing privilege.
5. **Owner's separate GO/NO-GO authorization.** Require an exact signed-off scope: target project ID, ordered migration IDs, Worker script/environment, routes, binding names (not values), tests, backup reference, verification queries, rollback operator steps.
6. **If and only if authorized:** deploy safely to an isolated staging path, verify observability and synthetic identities, then consider a separately approved hosted cutover. Incompatible old and new clients must not overlap during function privilege revocation.

## 5. Safe verification query examples (read only)

```sql
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT to_regclass('alp_private.alp_approval_attestation_keys') AS attestation_keys;
SELECT to_regprocedure('alp_private.submit_role_request_signed(uuid,text,uuid,text,bigint,uuid,text)') AS signed_rpc;
SELECT has_function_privilege('alp_approval_executor',
  'alp_private.submit_role_request(uuid,text,uuid,text)', 'EXECUTE') AS legacy_execute_still_allowed;
```

Never query, export, display or log signing-key bytes, auth tokens, credentials or student records.

## 6. No-go and rollback triggers

- Migration lineage or target project does not match approved manifest
- Backup/restore or safe traffic isolation is not demonstrably available
- A privileged function can be invoked with a forged actor or replayed proof
- App deployment uses an unverified Node/Workers compatibility assumption
- Old callers could continue using now-revoked unsigned functions
- Secrets become exposed to logs, client bindings, code, or untrusted operators
- Audit attribution, session revocation, RLS access or independent privacy review is not satisfied

On any trigger: **stop and isolate approval writes**. Preserve evidence, verify the database is in a consistent state, and use a pre-reviewed forward-fix/restore plan; do not silently restore insecure permissions.

## 7. Decision summary

**Source/test design:** GO for isolated development and review.  
**Migration reconciliation:** REQUIRED before hosted writes.  
**Hosted Supabase migration:** HOLD.  
**Cloudflare Worker deployments, bindings, DNS:** HOLD.  
**Institutional student-data onboarding:** NO-GO.  
**`village-strong`:** excluded without exception.
