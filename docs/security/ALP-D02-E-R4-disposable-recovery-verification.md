# ALP-D02-E-R4 — Approval Security-State Backup / Restore Proof

**Status:** SOURCE-ONLY / DISPOSABLE CI / PRODUCTION HOLD
**Baseline:** main after D02-E-R3D PR #21.
**Scope:** Critical approval state, not full Supabase disaster recovery.

## Actual recovery boundary

This R4 drill snapshots and restores exactly four database tables:
- `alp_private.alp_approval_attestation_keys`
- `alp_private.alp_approval_used_nonces`
- `alp_private.alp_approval_key_events`
- `supabase_migrations.schema_migrations`

These tables carry the HMAC signing-key lifecycle, consumed nonce replay
barrier, private key-event audit, and migration provenance. The backup
uses `pg_dump -Fc --table ...` from the pinned Supabase PostgreSQL
container. It restores those table definitions, data and ACLs into
two newly created schemas in a clean scratch database using
`pg_restore --no-owner --single-transaction --exit-on-error`.
Migration receipts are recovered as historical records; the
**migration DDL itself is not replayed in the scratch database**.

The test intentionally does **not** claim to restore the entire
Supabase auth/realtime/storage database, stored procedures, database
roles, authentication infrastructure, WAL, or server-level ownership.
Full logical restoration of the managed Supabase database was tried
and blocked by Supabase-managed schema ownership and interdependent
Realtime SQL. Rather than weaken the security gates or misrepresent
that as full recovery, R4 is scoped to the data that can be recovered
and precisely verified on a clean database.

## Mandatory safeguards

The script is callable only with `CI=true`, the exact local project
name, the exact loopback Postgres port 55132, the Postgres database
and login, exactly one named disposable Supabase DB container,
the R1 scratch marker and exactly 27 installed migrations. It refuses
to overwrite an existing recovery database.

Before the backup, the CI operator issues an all-key emergency revoke
**only on the fresh disposable source**. The snapshot requires every
key to be revoked and the consumed nonce table to be nonempty.

The backup is a private (0600), short-lived local runner file. Its SHA-256
is checked in memory before restoration. The archive can contain
synthetic signing secrets and is never logged or uploaded.
The script compares exact digests of sensitive data (without printing
secrets), ordered migration version+statement history, nonce state,
audits, revoked keys and denied table SELECT privileges on the
restored objects. It drops the scratch database and removes the archive
regardless of success or failure.

This ephemeral CI backup is **not encrypted**. All real backups require
approved encryption, KMS, audit controls and retention.

## Security checks independent of the restore

Before any archive work, R4 audits the source database's existing
restricted privilege boundary, confirming that:
- `alp_approval_executor` cannot rotate signing keys;
- `anon` cannot invoke emergency revocation;
- the attestation verifier is still owned by `service_role`.

The restore verifies table privileges, but does **not** prove that
SECURITY DEFINER function owners or global roles can be reconstructed
in a clean independent PostgreSQL cluster.

## Remaining production gates

- Design and execute a supported full Supabase managed-schema recovery,
  including role ownership, extensions, auth, grants and infrastructure.
- Validate offsite encrypted backups, point-in-time recovery, independent
  region/cluster restore, backups after key compromise, and recovery
  point/time objectives.
- Retest actual GoTrue logout/revocation, signing-key rotation,
  Hyperdrive/workerd execution and restored application behavior.
- Obtain explicit production authority; do not download or restore
  hosted records under this source-only R4 PR.

**Source-only CI: GO. Hosted backup/migration/deployment: HOLD.
Production student onboarding: NO-GO.**
