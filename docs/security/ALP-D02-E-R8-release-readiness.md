# ALP-D02-E-R8 — Cloudflare Release Readiness and Security Evidence (Source-Only)

**Decision: SOURCE_ONLY_HOLD — no deployment permission.**
**Repository baseline:** main after merged D02-E-R7C PR #27.
**Deployment platform:** Cloudflare Workers only.
**Cloudflare CLI:** `cf` — project has no existing Wrangler configuration. Do not create or migrate to Wrangler without explicit new authorization.

## Evidence delivered in this increment

The R8 release contract at `infrastructure/cloudflare/r8-release-readiness.json`
lists the public Worker module, four exact runtime bindings, the
tested `workerd` compatibility target, nine independent external
evidence gates, and references to source-only R7B/R7C CI runs.

`node infrastructure/scripts/check-r8-release-hold.mjs` runs in
read-only CI against the checked-out sources. It fails on:
- an implicit or explicit change from `SOURCE_ONLY_HOLD` to deployable state;
- renamed/missing bindings, an unapproved database login, or a
  Worker entrypoint that drops restricted-auth/session composition;
- embedded PostgreSQL URLs, private key material, token-like secrets,
  or a false claim that hosted platform evidence has been verified;
- accidental introduction of root Wrangler/cf deployment config,
  `cf deploy`, a Worker deployment action, or a secret provisioning
  step in the existing GitHub workflows;
- missing human security-release decision documentation, non-read-only
  repository CI permissions, or a deploy-capable package script.

Positive CI checks verify **enforcement of the HOLD**, not proof of
production readiness. A SHA-256 of the local Worker source is emitted
for review provenance; it is **not** a signed release attestation.

No binding *values*, remote project IDs, secret storage contents,
connection strings, or customer data are gathered. No Cloudflare
or Supabase API mutations occur.

## Proposed hosted deployment requirements — each still UNVERIFIED

1. **Account and environments:** independently approved Cloudflare
   account scope, separate staging and production, least-privilege
   deployment identities, and responsibility assignment.
2. **Hyperdrive and transport:** real Cloudflare-hosted Hyperdrive
   staging binding, verified TLS trust to hosted Supabase, database
   region/placement study, and constrained egress.
3. **Restricted database credentials:** no owner/service-role account,
   controlled `alp_approval_worker_login` provisioning, password
   rotation, and immediate revocation path. Local temporary role
   passwords in R7B/R7C are *not* production provisioning.
4. **Secrets:** Worker `APPROVAL_ATTESTATION_KEY` provisioned via
   secret binding, not a plaintext config or GitHub workflow.
   `SUPABASE_PUBLISHABLE_KEY` must remain publishable only.
5. **Hosted auth:** real hosted staging GoTrue sessions, session-lock
   behavior, signed request processing, logout and expiry exercised
   in the *hosted Worker runtime*.
6. **Observability:** Workers Logs and Traces enabled with structured,
   secret-free events; user and bearer identifiers redacted, secure
   retention policies, incident alerting and response ownership.
7. **Staged release and rollback:** canary exposure, negative tests,
   release integrity record, tested rollback, disabled routes by
   default, and a safe fail-closed outage/credential-revoke scenario.
8. **Full Supabase recovery:** separately provisioned cluster,
   platform-managed Auth/Realtime/Storage restore, encrypted
   independent backup/PITR, measured RPO/RTO and operator rehearsal.
   R4 scoped table restoration and R5 preflight do not meet this bar.
9. **Explicit decision:** approved security design, successful
   staging evidence, a release-owner signoff and a **separate**
   written production GO. GitHub source merging does not imply GO.

### Required bindings — names only, never values

| Binding | Classification | Release expectation |
| --- | --- | --- |
| `SUPABASE_AUTH_URL` | non-secret runtime config | Hosted HTTPS GoTrue origin; no URL credentials |
| `SUPABASE_PUBLISHABLE_KEY` | publishable API key | Must not be service-role or secret key |
| `APPROVAL_ATTESTATION_KEY` | Worker secret | Inject only through Cloudflare secret mechanism; tested rotation |
| `APPROVAL_HYPERDRIVE` | Hyperdrive binding | Restricted database login and verified TLS |

**No executable production deployment manifest is included.** The
account, Hyperdrive resource identifier, provider region, secret
provisioning method, hostname, and release authority are not yet
established as verified facts. Guessing values would be unsafe.

## Follow-on authorization

**R8A (source-only):** validate evidence inventory, branch protections,
workflow provenance, and credential controls.
**R8B (staging only, requires separate authorization):** create isolated
Cloudflare staging Worker and Hyperdrive resource, provision staged
secrets and verify real hosted TLS, observability and rollback.
**R8C (production, separate explicit GO):** only after all gates
are independently evidenced; no implied authorization.

**Hosted Supabase migrations: HOLD. Cloudflare staging/production
deployment: HOLD. Production student onboarding: NO-GO.**
