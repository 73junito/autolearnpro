# Foundation 7 — server-only approval HTTP endpoints

Implemented in `apps/web/src/role-approval.mjs` and routed by `apps/web/src/server.mjs`.

## Endpoints
- `POST /api/roles/request`: body `{ "targetId": "uuid", "role": "instructor", "reason": "justification" }`; creates pending request.
- `POST /api/roles/decision`: body `{ "requestId": "uuid", "approve": true, "reason": "decision rationale" }`; records decision and the approved grant through private functions.

Both require Authorization: Bearer <Supabase JWT>. The server calls Supabase Auth `/auth/v1/user` with the token to obtain the verified actor UUID; client-supplied actor IDs are rejected. The server uses a private PostgreSQL connection, wraps calls in transactions, and scopes `SET LOCAL ROLE service_role` to each transaction. Public clients never receive the DB credentials. SQL errors are not returned verbatim.

## Configuration
Server process variables (never `NEXT_PUBLIC_*`):
- `ALP_SUPABASE_URL` — exact local or separately approved cloud Supabase URL.
- `ALP_SUPABASE_PUBLISHABLE_KEY` — project public key.
- `ALP_DATABASE_URL` — **server-only privileged database connection URI**, never publish in Git, logs, browser, CI public output, or client bundles.

If configuration is absent, role routes return HTTP 503. The Node web server binds to loopback by default.

## Tests and limits
`tests/role-approval-http.test.mjs` verifies authorization failures, actor derivation from trusted Auth response, request validation, denial of forged token and client actor field, and fail-closed unconfigured behavior. Two Node tests now run under `npm test`.

**Not yet production ready:** the Node HTTP tests mock Supabase Auth and DB, and do not prove complete live integration with the privilege-enabled DB connection, revocation/expiry, audit durability, approval races, or proxy/server deployment. The underlying SQL workflow and its own local tests were separately validated. Requests can be made only via a trusted process configured with server-side DB credentials. Deploying to a web-accessible network needs TLS, request rate controls, operational secret management, audit observation, and authorized admin bootstrap. No cloud deployment or push was executed.
