# ALP-D02-E-R3D — Signing-Key Lifecycle and Emergency Revocation

**Status:** SOURCE-ONLY SECURITY IMPLEMENTATION; hosted Supabase and Cloudflare HOLD.
**Baseline:** main after merge of PR #20.
**Scope:** HMAC actor attestations for restricted approval RPCs.

## Architectural decision

Retain the existing six-parameter attestation-verifier interface and
seven-parameter signed approval RPCs. A key ID is not included in the
HMAC framing: the verifier checks at most one `active` and one
`retiring` 256-bit signing key; globally unique proof nonces remain
single-use regardless of which key signed them.

R3D extends `alp_private.alp_approval_attestation_keys` from a single
`key_id=1` row into an admin-managed registry with:
- `active`: exactly one permitted issuing key; no expiration.
- `retiring`: at most one old key, accepted only until `not_after`.
- `revoked`: cryptographically denied immediately for new verification.

Unique partial indexes enforce at most one active and one retiring key.
Existing key 1 becomes active without changing its secret bytes. A
new unused positive integer key ID, greater than 1, identifies each
new rotation key. The original owner `service_role` retains the
private verifier; the migration temporarily grants and then revokes
schema CREATE to safely replace its function under that owner.

The R3D `rotate_approval_attestation_key(key_id,key_bytes,overlap_seconds)`
admin function is transaction-serialized with an advisory lock and
permits a **maximum 60-second** overlap (including zero for hard
cutover). It rejects key-ID reuse and concurrent retiring overlaps.
`revoke_approval_attestation_key(key_id)` immediately disables one key.
`emergency_revoke_approval_attestations()` revokes ALL nonrevoked
keys and fails all future approval attestations closed.

Only `postgres` receives EXECUTE on lifecycle functions; PUBLIC,
anon, authenticated, service_role, and both executors and worker
logins have explicit revokes. The existing approval executor has no
table SELECT privileges. The private audit table records key IDs,
rotation/revoke action, UTC change time, overlap and actor role,
never key material.

## Secure provisioning and rotation process (separate GO required)

1. Obtain an approved maintenance window and confirm current revision,
   backup/restore viability, and active key ID. Confirm no concurrent
   unexpired retiring key.
2. Generate a **new random 32-byte secret** through an approved secret
   manager. Never print it, include it in a migration or Git source,
   store it in a URL, or place it in application logs.
3. Use an authenticated, privileged **parameterized** call to the
   private rotation function with unused key ID and approved overlap
   (0-60 seconds). The database immediately accepts the new key and
   only temporarily accepts the old key.
4. Update the isolated Cloudflare Worker signing secret to the new
   value, using an authorized private secret binding, during that
   overlap window. Verify synthetic signed requests immediately.
5. Revoke the previous key through the privileged single-key revoke
   function. Verify old proofs now fail and new proofs pass; review
   the private key-event audit.
6. If a release cannot be finished within 60 seconds, **do not assume
   zero-downtime rotation**. Use a scheduled fail-closed maintenance
   window. There is no supported automatic overlap extension or key
   reuse in this migration.

### Emergency revocation

A privileged operator calls the single-key revoke function for a
specific compromised key, or the all-key emergency revoke function
for suspected full signing-runtime compromise. Both actions are
transactional and serialized with rotation. Alert, isolate the
signing runtime, investigate HMAC key exposure and replay indicators,
then provision a *new* random key with unused key ID and zero overlap
after independent approval.

A revoked key ID must never be reused. Revocation does not undo
already committed role grants; those require a separate access-review
and rollback procedure. An operation already verified in an in-flight
database transaction may finish after revocation commits; a separate
emergency service shutdown is required for stricter stop-the-world
semantics.

## Verification

CI applies all **27 ordered migrations** to a fresh disposable
Supabase database, seeded with synthetic key 1. The dedicated R3D
live test checks:
- Existing legacy key 1 proof acceptance before rotation.
- Rotation to key 2 with 45-second overlapping acceptance.
- Global replay nonce denial even when a different accepted key signs.
- Denial of simultaneous overlaps and key-ID reuse.
- Immediate targeted revocation of old key 1 while key 2 remains valid.
- All-key emergency revocation blocks key 2.
- Explicit recovery with a new key ID (3) and zero overlap.
- Restricted executor and public inability to access administrative
  functions or private signing key table.
- Private audit event types and ordering.

The R1/R2/R3B/R3C disposable security gates remain mandatory.

## Explicit limitations

This source-only change does not provision any hosted key, apply any
hosted migration, configure Cloudflare secrets, or perform a production
rotation. It does not validate production workerd runtime, GoTrue
signout integration, secret-manager availability, live key switching,
or restore/recovery drill. The legacy Node signing client still reads
the configured signing key from its environment; production key
switching requires independently coordinated rollout.

**Source-only CI:** GO. **Hosted deployment:** HOLD. **Production:** NO-GO.
