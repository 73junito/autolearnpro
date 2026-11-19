# ALP-D02-E-R3B — Trusted Active-Session Broker

**State:** SOURCE-ONLY / DISPOSABLE TESTING / REVIEW HOLD
**Scope:** AutoLearnPro approval Worker; no hosted Supabase or Cloudflare changes
**Source baseline:** `main` after PR #18

## Architecture

The existing Worker approval handler verifies a bearer token through GoTrue,
checks actor and session claims bound to that bearer, and requires an injected
`checkSession({actor, sessionId})` callback before approving a quota
transaction and again before the subsequent privileged mutation. This
project's strict session policy additionally requires active session
existence in `auth.sessions`; an unexpired JWT alone does not suffice.

`worker-approval-session-broker.mjs` now supplies the callback. It reuses the
R2 `alp_approval_worker_login` connection and the static transaction role
`alp_approval_executor`; it calls only the parameterized boolean RPC
`alp_private.approval_session_active(actor, sessionId)`.
The callback does not cache results or accept caller SQL. Malformed UUIDs
deny without database access, and malformed database responses throw,
causing the Worker to return its generic unavailable error.

## New database migration

The CLI-generated migration `approval_active_session_broker` adds one
narrow SQL `SECURITY DEFINER` function in the private schema.
It tests the simultaneous actor/session binding, requires the session
record to exist, and rejects a past `not_after` timestamp. It does not
expose session data or grant table/schema SELECT privileges to the
Worker login. EXECUTE is revoked from PUBLIC, anon, authenticated,
the academic executor, the academic Worker login and the approval Worker
login, and granted only to `alp_approval_executor`.
The definer's `auth.sessions` access must be proven on disposable
Supabase PostgreSQL before merge.

The verifier runs *after* GoTrue validates the exact bearer. Reading
JWT claims locally is **not signature verification**. Real GoTrue
revocation and session administration remain independently testable
integration concerns.

## Test requirements

1. Run all **25 migration versions** on fresh, disposable Supabase.
2. Verify the restrictive function grants and direct SELECT denial.
3. Insert synthetic, isolated auth.users/auth.sessions entries in CI.
4. Confirm matching actor/session returns true, different actor or
   unknown session returns false, expired `not_after` returns false,
   and deletion immediately returns false without caching.
5. Continue the existing D02-D signature/replay and R2 executor tests.
6. Remove synthetic auth records and destroy the disposable database.

**Security note:** the session lookup and signed mutation are two
separate transactions. The pre-write recheck reduces, but does not
eliminate, a race if the session is revoked after that check. A
future transaction-atomic session check within the signed RPC is a
separate high-assurance gate.

## Production blockers

The hosted database has not applied D02-D nor this migration. The
hosted approval Worker has no deployed entrypoint or authenticated
Hyperdrive configuration. Key rotation, emergency revoke operations,
real GoTrue signout/revocation tests, and backup/restore rehearsal
remain required. Do not use the production `auth.sessions` records
as tests or expose service_role credentials to application clients.

**Source development: GO. Hosted migration and Cloudflare deployment: HOLD.
Production student onboarding: NO-GO.**
