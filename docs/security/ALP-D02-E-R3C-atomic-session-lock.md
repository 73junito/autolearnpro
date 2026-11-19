# ALP-D02-E-R3C — Transaction-Atomic Approval Session Lock

**Status:** Source-only implementation; disposable CI verification required.
**Scope:** Cloudflare-compatible AutoLearnPro Worker approval submit and decide operations.
**Baseline:** `main` after PR #19; no hosted Supabase writes.

## Remaining race and mitigation

R3B checks `auth.sessions` in its own transaction, and the Worker repeats
the check after quota. A concurrent revocation can delete the session
after that second check but before the approval mutation.

R3C adds a private `alp_private.lock_approval_actor_session(uuid,uuid)`
SECURITY DEFINER function which verifies session ID, matching user ID,
and the session's `not_after` expiry, using `SELECT ... FOR SHARE`.
The row lock is held until the **same transaction** finishes. PostgreSQL
`DELETE` and conflicting `UPDATE` cannot commit while the lock is held.
After revocation commits, the function returns false and rejects the write.

The Worker executes that function through the R2 restricted transaction
port immediately before `submit_role_request_signed` or
`decide_role_request_signed`. A missing or false lock result raises
`42501`; neither signed mutation runs. The existing separate GoTrue
validation, active-session broker, quota, and HMAC attestation all remain
mandatory. The function has no PUBLIC, anon, authenticated, academic,
or login-role execution permission; only `alp_approval_executor` may call it.

## Verification

A fresh disposable Supabase database must apply all **26 migrations**.
The expanded R3B live suite creates a synthetic user/session pair,
holds the approval connection transaction open after acquiring
the new session lock, attempts a concurrent session deletion, and
requires a `55P03` lock-timeout response. Once the approval transaction
commits, deletion must succeed; subsequent lock attempts must return
false. Fixture rows are cleaned on all paths, and the disposable database
is discarded.

Unit tests verify lock ordering before BOTH signed mutation operations,
correct actor/session parameters, and fail-closed behavior on a denied
atomic lock.

## Remaining guarantees and limits

The concurrency protection covers PostgreSQL session-row UPDATE/DELETE
that honors normal row-locking semantics. It does not retroactively
invalidate an approval committed before revocation, nor does it prove
equivalent behavior for every external identity-provider action.
Session expiry could occur during a transaction after the last
clock-time check, and real GoTrue signout and full Worker-runtime
integration remain future verification gates.

The Node-only legacy approval path is not changed by this source-only
Worker adapter improvement. The new SQL is unapplied on hosted Supabase.
Hyperdrive credentials, signing-key rotation, recovery rehearsal and
institutional production acceptance remain on HOLD.

**Development:** GO. **Hosted migration, Cloudflare and production:** NO-GO.
