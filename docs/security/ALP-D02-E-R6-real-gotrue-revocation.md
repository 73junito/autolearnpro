# ALP-D02-E-R6 — Real GoTrue Sign-out and Restricted Approval Denial

**Status:** SOURCE-ONLY / DISPOSABLE CI / HOSTED HOLD
**Baseline:** main after merged R5 PR #23.
**Scope:** GoTrue local/global signout and the restricted Worker approval authorization path.

## Purpose

Supabase JWT access tokens remain cryptographically usable until
their `exp` claim expires, even after signout. A high-risk approval
handler must consult the actual `auth.sessions` table and reject a
bearer token whose `session_id` has been revoked. R3B introduced that
restricted broker; R3C added a transaction-level session row lock.
R6 verifies these against **real GoTrue login and logout HTTP calls**,
not manually inserted synthetic session records.

## Real, isolated integration test

Within CI's fresh Supabase instance (27 ordered migrations), after
the restricted login has been configured and before R3D rotates the
HMAC signing key, the R6 gate:

1. Refuses execution unless `CI=true`, the pinned disposable
   project ID, loopback PostgreSQL port 55132, matching restricted
   login, and a correctly shaped CI-only HMAC key are present.
2. Reads the **local** gateway publishable/anon API key from
   `supabase status -o json` in memory, never prints it or sends it
   to hosted Supabase.
3. Registers an isolated email/password user through real local
   GoTrue and signs in twice to create two distinct `auth.sessions`
   rows tied to the same actor.
4. Confirms the restricted R3B broker recognizes both sessions.
5. Sends a request with intentionally invalid fields through the
   **real Worker approval adapter**, actual GoTrue /user verification,
   restricted PostgreSQL connection, and signed quota path. A valid
   login reaches body validation (HTTP 400), proving the bearer was
   accepted without triggering an approval role mutation.
6. Calls GoTrue `POST /auth/v1/logout?scope=local`, confirms the
   signed-out session disappears while the second remains, and
   demonstrates that the original token receives HTTP 401 from
   the approval adapter.
7. Confirms the surviving second session still reaches body
   validation, then calls GoTrue `scope=global` to revoke the
   remaining session and requires another HTTP 401.
8. Rejects an invalid/tampered JWT and confirms no lingering sessions
   for the CI user.
9. Removes the disposable user and any remaining sessions.

Tokens, passwords, bearer headers, API keys and secrets are not logged.
The gate fails if GoTrue login/logout behaves unexpectedly or if the
approval handler permits a revoked session.

## Remaining limitations

- R6 validates actual GoTrue logout against R3B and the Worker
  handler. The R3C concurrent-row-lock behavior remains separately
  covered by its existing real PostgreSQL test.
- GoTrue provider administrative signout, MFA, refresh-token races,
  timeout policies, account deletion, and production-side cookie
  invalidation are not represented as verified by this gate.
- Real Cloudflare workerd, Hyperdrive TLS networking, and per-tenant
  browser sessions remain separate staging validation.
- No production users, hosted Supabase records, secrets, Cloudflare
  deployment or DNS are touched.

Sources: Supabase documentation on user sessions and sign-out scopes
(https://supabase.com/docs/guides/auth/sessions and
https://supabase.com/docs/guides/auth/signout).

**Source-only test changes:** GO.
**Hosted Supabase migrations and Cloudflare deployment:** HOLD.
**Student onboarding:** NO-GO.
