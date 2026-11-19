# ALP-D02-E-R1 — Combined Migration History Verification

**Status:** SOURCE RECOVERED — DISPOSABLE VALIDATION PENDING
**Date:** 2026-11-18 (America/Chicago)
**Scope:** AutoLearnPro only, no hosted database changes
**Base:** `main` after merged PRs #13, #14 and #15

## Origin and integrity

Hosted Supabase project `dmtnuvhzmgfavglyjwsl` contains migration
`20261114202924_worker_restricted_login_roles_passwordless` in
`supabase_migrations.schema_migrations`. The migration's **stored SQL
statement** was read through a read-only database query, not reconstructed
from its name or from assumed desired SQL.

- Hosted `statements` array: 1 SQL statement
- Hosted stored SQL length: 1,517 bytes
- Hosted stored SQL SHA-256:
  `7b74ddab411d93d83b5d48a1d23e2dab82c3b25e25dcedd4c3bb528ef919b0f1`
- Recovered local file:
  `supabase/migrations/20261114202924_worker_restricted_login_roles_passwordless.sql`
- Verified recovered file: **1,517 bytes and identical SHA-256** to hosted stored SQL
- Source is the hosted *migration history record*, not the original authoring
  branch. Attribution and independent historical code review remain pending.

The recovered SQL fails closed if either worker-login role already exists
or either executor role is missing or privileged. It creates exactly two
passwordless login roles (academic and approval), with `NOINHERIT`,
`NOSUPERUSER`, `NOBYPASSRLS`, and no credential material.
Each role receives only its corresponding executor membership with
`INHERIT FALSE`, `SET TRUE`, and `ADMIN FALSE`.

No credential, access token, password hash, student data or account secret
is copied into the recovered migration.

## Version ordering

The repository previously contained 23 SQL files, ending with
`20261119011728_approval_actor_attestation_boundary.sql`. The hosted
database also reported 23 applied migrations, but with
`20261114202924_worker_restricted_login_roles_passwordless` instead.

The reconciled repository now contains **24 distinct migration versions**:
the original first 22 versions, followed by the historical
`20261114202924` migration, followed by the D02-D `20261119011728`
signed-actor migration. The two latter migrations must be applied
sequentially in version order on a **fresh disposable** database.

Do not use `supabase migration repair` on the hosted instance.
Do not use matching migration counts as an equivalence proof.

## Verification gate

The CI workflow must:
- Reject an unexpected migration count or migration filename order.
- Independently compare recovered migration bytes to the hosted fingerprint.
- Apply the complete 24-migration history on a fresh, disposable Supabase DB.
- Verify migration history contains both recovered and D02-D versions.
- Verify both recovered login roles: LOGIN, NOINHERIT, no superuser, no
  BYPASSRLS, no password, exactly one restricted executor membership,
  no membership inheritance, SET allowed, no ADMIN delegation.
- Verify restricted academic and approval positive and negative integration
  tests; in particular direct unsigned approval actor spoofing is rejected.
- Verify disposable test fixture cleanup and discard the database.
- Leave linked/hosted Supabase untouched, and keep Cloudflare deployments,
  bindings and DNS unchanged.

### Scope limitation

A passing disposable 24-migration suite verifies **migration compatibility**
and the test harness's security checks; it does not prove all pre-existing
hosted schema objects match the tested database.

The hosted database has not yet applied D02-D, so its original unsigned
approval functions remain a known trust-boundary weakness. Key provisioning,
a real restricted Workers transaction provider, session-revocation guarantees,
backup/restore testing and institutional sign-off remain mandatory.

**CI/source development: GO. Hosted DB migration: HOLD. Production: NO-GO.**
