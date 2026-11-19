# ALP-D02-E-R5 — Managed Supabase Recovery Preflight

**Status:** SOURCE-ONLY / READ-ONLY DISPOSABLE CI / INDEPENDENT RESTORE NOT VERIFIED.
**Baseline:** `main` after merge of PR #22.
**Protected boundaries:** Hosted Supabase, Cloudflare, credentials, DNS, C3-R37G and Village Strong excluded.

## Why R5 exists

R4 established that key-state, consumed nonces, key-event audits,
and migration receipts can be backed up and restored into a fresh
database. Attempts to reconstitute an entire Supabase installation
from application-level `pg_dump` failed on platform-owned Auth
schema ownership and Realtime function dependencies.

Those failures may not be bypassed by `--no-owner`, superuser
assumptions, or weakening SQL security policies. Supabase manages
global roles, extensions, SQL permissions and cross-service data
that require an independently supported recovery method.

## Executed R5 gate

The new R5 recovery preflight runs after the R4 disposable recovery
exercise. It opens a **READ ONLY** PostgreSQL transaction on the
same disposable CI database, requires the scratch marker, and
collects only non-secret PostgreSQL catalog metadata:

- 27 ordered migration version/statement hashes (statements not printed);
- `alp_private`, `auth`, `extensions`, `realtime`, `storage` schema owners;
- four restricted executor/login roles and their LOGIN/SUPERUSER/
  BYPASSRLS attributes, plus exact role membership SET/INHERIT/ADMIN flags;
- private SECURITY DEFINER function signatures and owners;
- installed extension names/versions/schemas, including `pgcrypto`;
- table and administrative function grants protecting approval signer,
  Auth sessions, rotation and atomic session locks.

A missing schema, role, migration, membership, `pgcrypto`,
expected attestation-verifier ownership, or widened privilege
**blocks** the CI preflight. Negative unit tests mutate each of
these requirements to ensure the validator actually rejects them.

No role passwords, user email addresses, JWTs, private key material,
cloud identifiers, or data dumps are selected or logged.
R5 emits only PASS/HOLD decision lines, not sensitive inventory
values or an exportable database manifest.

## Not yet validated

`INVENTORY_VERIFIED` is not `RESTORE_VERIFIED`.
The R5 result explicitly holds the following until separate,
authorized work is completed:

1. Independent PostgreSQL/Supabase deployment with compatible
   Postgres version, extensions, and platform-managed global roles.
2. Supported full Auth/Realtime/Storage schema and ownership
   restoration, without broadening the restricted approval roles.
3. Encryption at rest for offsite backup media, trusted KMS,
   retention, and independent restore-based validation.
4. Point-in-time recovery, RPO/RTO targets, restore evidence,
   and incident/rollback playbooks.
5. Real GoTrue account/session logout and revocation behavior.
6. Actual Cloudflare `workerd` or staging Worker with least-privilege
   database connection and non-exportable secrets.

**Source development/inventory:** GO.
**Full disaster recovery claim:** NOT VERIFIED.
**Hosted Supabase migration/backup/restore:** HOLD.
**Cloudflare production deployment:** HOLD.
**Production student onboarding:** NO-GO.
