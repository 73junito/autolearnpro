# Foundation 4: Runtime health contract

This is a **minimal Node.js HTTP health server**, not a complete user-facing web application or a production readiness check.

- `GET /health` returns HTTP 200 and JSON `{"status":"ok","service":"autolearnpro-web"}`.
- All other paths and methods return 404.
- Responses have `cache-control: no-store`.
- No database, external network requests, user accounts, credentials, or legacy services are used.
- The local manual entrypoint binds to `127.0.0.1` by default; no public deployment or Docker port exposure is configured.

From `F:\autolearnpro` run `npm test` or `npm run test:runtime`.
For a manual check, run `npm run start --workspace @autolearnpro/web` and visit `http://127.0.0.1:3000/health`.

This endpoint verifies only that the local HTTP process responds. Database readiness, authentication, migrations, backup/restore and production health are **future foundations**, not validated by this check.
