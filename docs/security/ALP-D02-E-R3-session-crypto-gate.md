# ALP-D02-E-R3 — Identity, Session and HMAC Security Gate

**Status:** SOURCE-ONLY SECURITY HARDENING / PRODUCTION HOLD
**Scope:** Cloudflare-compatible AutoLearnPro approval adapter only
**Base:** `main` after PR #17

## Confirmed risk

GoTrue `GET /auth/v1/user` verifies an access token and its user, but does
not alone prove that an underlying session has not been terminated.
Supabase sessions have a `session_id` JWT claim corresponding to
`auth.sessions.id`. An access JWT can remain cryptographically valid
through its remaining lifetime even after the user signs out.

See https://supabase.com/docs/guides/auth/sessions .

## Source changes

- `approval-session-claims.mjs` parses the session ID, actor and expiration
  from the **same bearer token already authenticated by GoTrue**. This
  parser is **not a JWT signature verifier** and must never be called in
  isolation to grant permissions.
- `worker-approval-adapter.mjs` now requires a trusted
  `checkSession({ actor, sessionId })` function; without it,
  `enabled === false` and requests fail closed with 503.
- After GoTrue validation, the handler requires the claim subject to
  match the verified user, a valid session UUID, a valid nonexpired
  token, and `checkSession(...) === true`.
- The callback is consulted a second time after quota and before the
  privileged approval RPC. Revoked/unknown sessions return 401,
  while unavailable session verification returns 503 without mutation.
- Never accept session state from user-controlled body fields, user
  metadata, unsigned token claims, or an unauthenticated client API.

## Mandatory follow-on: trusted active-session broker

**No production implementation of `checkSession` is supplied by R3.**
A future separately reviewed broker must check live `auth.sessions`
existence and binding to the verified user, using independently scoped
authorization and without exposing `auth.sessions` or service-role
credentials to the browser or general restricted approval login.

The broker must be tested against actual GoTrue logout and revocation,
including revoked access tokens that remain within their JWT expiry
window, a session belonging to another user, a deleted session, wrong
session ID, transport timeout, and subsequent key rotation. Remote
hosted Auth is OUT OF SCOPE for testing without authorization.

Two independent checks reduce the race interval; they are not proof of
atomic session validation at the database-write instant. A stronger
database-side single-transaction assertion may be required for
institutional high-assurance approvals.

## HMAC key rotation and replay management

D02-D currently uses one 32-byte key in the Worker and in the private
database key store, plus expiring operation-bound signatures and single-use
nonces. R3 synthetic tests verify that changing any actor, operation,
payload, key or nonce changes the signature.

**Rotation is NOT implemented** by the existing D02-D one-key database
schema. Avoid changing the key independently on either side, because
all signed operations will fail closed. Before provisioning:
1. Design key-ID support with distinct current/retiring keys, an exact
   supported overlap period, and explicit nonce-replay scoping.
2. Review and test migration, minimum expiry, clock skew, and rotation
   rollback in disposable databases.
3. Store the Worker-side signing secret only in an approved private
   server-side secret binding. Do not expose it in source, build-time
   public configuration, chat, logs, or analytics.
4. Add a controlled retention/pruning policy for used nonces; avoid
   ever accepting expired or re-used proofs.
5. Document compromise response, emergency signing-key revocation,
   and audit export before production cutover.

## Validation scope

- New R3 tests exercise valid/invalid session claims, verified user
  mismatches, malformed JWTs, inactive and revoked sessions, broker
  outages, and post-quota revocation denial.
- Cryptographic negative controls demonstrate separation by operation,
  actor, payload, key and nonce.
- Existing D02-D disposable DB CI continues to test replay denial,
  unauthorized signed requests and narrow executor privileges.
- Source-only tests do **not** prove the real GoTrue session broker,
  credential rotation, Workers runtime, live institutional data paths,
  or current hosted configuration.

## Decision

Source-only CI and review: GO.
Trusted broker implementation, key rotation and real GoTrue revocation
integration: REQUIRED.
Hosted Supabase migration: HOLD.
Cloudflare Workers deployment: HOLD.
Institutional student onboarding: NO-GO.
