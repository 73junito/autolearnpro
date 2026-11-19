# ALP-D02-E-R4 — Disposable Database Backup / Restore Verification

**Status:** SOURCE-ONLY DEVELOPMENT AND DISPOSABLE CI; hosted recovery not authorized
**Baseline:** main after source-only merge of D02-E-R3D PR #21
**Scope:** 27-migration database lineage, approval authorization, signer key lifecycle and replay state

## Design and recoverability decision

This drill validates a full PostgreSQL logical archive and clean restoration of the
disposable Supabase project's database into a distinct, initially empty database
named `alp_r4_recovered` on the **same isolated GitHub Actions PostgreSQL
container**. It does NOT test cloud infrastructure disaster recovery, physical
WAL recovery, point-in-time restoration, independent-cluster/global-role restore and exact ownership for all
Supabase-managed schemas,
or decrypting an encrypted production backup.

The drill is inserted *after* all existing R1/R2/R3B/R3C/R3D integration tests,
and *before* their final ephemeral database destruction.
The R4 runner refuses to run unless all of these agree:
- `CI=true` and `ALP_R4_CI_PROJECT_ID=autolearnpro-foundation6`.
- PostgreSQL URL points to `postgres` user on `127.0.0.1` or `localhost`,
  port `55132`, database `postgres`.
- Exactly one Docker container named `supabase_db_autolearnpro-foundation6`.
- The fresh R1 marker exists and exactly 27 migration entries are recorded.
- No preexisting `alp_r4_recovered` database.
All checks must pass before taking any archival or recovery action.

## Backup and restoration

1. The CI-owned admin performs all-key emergency revocation on **only
   the disposable database**, producing a test snapshot with no usable
   active HMAC keys. This tests the critical fail-closed restore condition.
2. Capture nonsecret verification evidence: ordered migration statement
   checksums, key-state/secret digests (never secret bytes), key-event
   digests, consumed nonce digests, role identity, owner, and
   function/table privilege state.
3. `pg_dump -Fc` is executed inside the **pinned Supabase PostgreSQL
   container**, avoiding major-version mismatches from system clients.
4. The complete archive is stored in the GitHub runner's private
   temporary directory with owner-only file permissions (0600).
   Check the archive SHA-256 before restore.
5. Create a new clean database `alp_r4_recovered TEMPLATE template0`;
   restore with the matching container `pg_restore --exit-on-error
   --single-transaction --no-owner`, retaining ACLs. Supabase's
   non-superuser `postgres` login cannot automatically adopt certain
   built-in schema owners such as `supabase_admin`. Independently reset
   **all private approval SECURITY DEFINER function owners** from a
   source-catalog allowlist (`postgres` or `service_role`), rejecting
   unexpected owners rather than silently escalating rights.
6. Verify exact correspondence of ordered migration history, secret
   digest, revoked key status, nonce replay evidence, audit events,
   role properties, restricted grants and original `service_role`
   verification-function ownership.
7. Verify the restored database cannot silently resurrect any
   previously revoked signing key and retains nonce replay history.
8. Drop the restored database and delete the temporary archive
   regardless of test success or failure; CI then destroys the entire
   disposable Supabase instance.

The archive contains the synthetic test signing-key bytes and synthetic
user data. It must **never be exported, logged or uploaded**. The archive
is **not encrypted** because it exists only in ephemeral, isolated CI
memory/disk. Real production backups MUST be encrypted with an approved
KMS and access/retention controls before similar work is authorized.

## Recovery limitations and further gates

The drill relies on cluster-global roles installed by the disposable
Supabase instance; a clean independent PostgreSQL server would require
separately secured global-role reconstruction and compatibility proofs.

No real users, production signers, production backups, live GoTrue
revocations, Cloudflare Workers, DNS, Hyperdrive or production Supabase
systems are exercised by this task.

Before production: document recovery-point and recovery-time objectives,
test independently provisioned role/global-state restoration, verify
encrypted offsite backups and retention, rehearse incident communications
and key-compromise playbooks, verify actual GoTrue logout behavior, and
obtain explicit approval for every hosted step.

**CI/source-only:** GO. **Hosted migration, backup, restoration or Cloudflare
deployment:** HOLD. **Student onboarding:** NO-GO.
