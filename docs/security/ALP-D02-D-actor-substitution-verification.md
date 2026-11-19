# ALP-D02-D — Actor-Bound Approval Attestation Remediation

**Status:** REMEDIATION CANDIDATE — DISPOSABLE CI VERIFICATION REQUIRED
**Date:** 2026-11-18
**Release gate:** PRODUCTION NO-GO

## Confirmed security defect

In the uploaded GitHub Actions log for the D02-D negative control, a restricted
approval executor called the original `submit_role_request` function using a
different user's UUID. The call was accepted. This demonstrates that the original
executor grant did not independently bind the actor to a verified identity.

## Proposed fix in this branch

1. The approval server verifies the bearer with GoTrue, then issues a short-lived
   HMAC-SHA256 attestation bound to the verified actor, operation, arguments,
   timestamp and random nonce. A key is loaded from the server-only
   `ALP_APPROVAL_ATTESTATION_KEY` environment setting.
2. PostgreSQL checks the attestation using a secret stored in the protected
   `alp_private.alp_approval_attestation_keys` table. The server and database
   must use the same independently provisioned 32-byte secret.
3. Four new `*_signed` database entrypoints validate the attestation before
   invoking the legacy private functions. The approval executor's `EXECUTE`
   privileges on the unsigned entrypoints are revoked.
4. A unique-nonce table rejects replay. Signatures expire after 60 seconds,
   with 15 seconds of allowed positive clock skew.
5. The approval handler refuses to enable without a valid 64-character
   hexadecimal key. The database refuses signed operations without an
   independently provisioned secret.
6. The dedicated disposable CI harness generates an ephemeral key, provisions
   only its fresh database, and supplies the same value only to the synthetic
   approval test process. No key appears in the migration or output logs.

**Security boundary:** This protects against database-login compromise or
arbitrary SQL from the restricted executor without the separate signing key.
It does NOT protect against complete compromise of the trusted application
runtime, which also holds the signing key. A separate broker / signing service,
strong secret separation, and independent institutional review may be required
for higher-assurance deployments. Never treat a client-set
`request.jwt.claim.sub` setting as authenticated proof.

## Database and deployment conditions

- The new migration is additive and **must not** run against hosted Supabase
  without a separate authorized migration and rollback decision.
- Existing live `alp_approval_executor` connections lose unsigned execution
  privileges after migration. The application must be upgraded and the two
  secrets provisioned together in an explicit cutover plan.
- The migration creates new private tables and functions. A rollback requires
  a separate, carefully reviewed migration; do **not** simply restore the
  insecure old executor grants in production.
- Key rotation, nonce-table pruning, replay-denial observability and independent
  broker separation remain operational hardening tasks. They are not silently
  counted as completed.
- The academic executor's legacy event-logging function is intentionally not
  changed by this approval-only remediation; academic audit attribution needs
  separate examination.
- No `village-strong` Worker usage, deployment, DNS or secret changes.

## Verification gate

- Validate Node and SQL syntax, format and lint.
- Unit/runtime suite must pass with 0 skips.
- Fresh local database must run all 23 ordered migrations.
- The existing D02-D unsigned actor-spoof negative control must now **pass**
  because direct unsigned execution is forbidden.
- Invalid signed proof must be rejected; signed application requests must
  submit, approve, deny, audit and rate-limit correctly.
- Run the restricted academic executor and progress integrations too.
- A passing synthetic CI suite does not authorize production deployment,
  institutional onboarding, or closure of the remaining D02 findings.

**Merge:** REVIEW after CI results.
**Hosted database migration:** HOLD.
**Production:** NO-GO.
