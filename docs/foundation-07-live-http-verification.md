# Foundation 7 — live local HTTP/Auth/PostgreSQL integration

Verified against isolated local Supabase at `127.0.0.1:55121` and `supabase_db_autolearnpro-foundation6` using `tests/role-approval-live.test.mjs`.

## Confirmed results
- Four disposable email/password users received locally issued Supabase Auth JWTs.
- Trusted local DB bootstrap granted one reviewer administrator status for testing.
- Authenticated role request returned HTTP 201 and persisted a private pending request.
- Unauthorized reviewer returned HTTP 403; requester self-approval returned HTTP 403; tampered JWT returned HTTP 401.
- Qualified reviewer successfully approved an instructor request (HTTP 200).
- Duplicate approval returned HTTP 409; role assignment, reviewer identity, approved decision, and role-change audit were verified directly in PostgreSQL.
- Cleanup removed test users, requests, role assignments and audit records. Follow-up counts: all zero.
- Existing Node tests: 2 passed, 0 failed.

## Reproduce
Run `npm run test:approval:live` with environment variables `ALP_LOCAL_INTEGRATION=1`, `ALP_SUPABASE_URL=http://127.0.0.1:55121`, `ALP_SUPABASE_PUBLISHABLE_KEY` (local public key), and `ALP_DATABASE_URL` (local PostgreSQL URL). Obtain ephemeral development values with local `supabase status -o env`; do not print keys or save credentials in files or CI logs. Without the opt-in flag this test is skipped.

## Production gates still open
- Implement request rate limits, durable audit monitoring, abuse protection, independent admin-elevation approval, token expiry and revocation coverage, deployment-secret protection, and TLS/reverse-proxy verification.
- Treat administrative bootstrap via direct DB access strictly as a **test fixture**. It is not an approved production onboarding method.
- Keep the cloud `autolearnpro.com` project unchanged until these gates and separate deployment review are complete.
