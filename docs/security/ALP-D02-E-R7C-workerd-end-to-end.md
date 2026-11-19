# ALP-D02-E-R7C — Real Approval Worker End-to-End Verification

**Status:** Source-only GitHub CI against disposable Supabase + local Cloudflare workerd.
**Baseline:** Main after R7B PR #26. **Cloudflare production deployment: HOLD.**

## Scope and execution

R7B validated transaction commit, rollback, privileged role isolation,
and revocation from a **test-only** Worker fixture. R7C removes the
remaining split by executing the **actual public approval Worker module**
(`apps/web/src/worker-approval-entrypoint.mjs`) in the pinned local
Cloudflare workerd runtime with a real Miniflare Hyperdrive local
binding and real local GoTrue HTTP server.

The CI harness first requires `CI=true`, the exact disposable project
`autolearnpro-foundation6`, both loopback PostgreSQL URLs at port
55132 and required restricted/admin logins, and a valid ephemeral
signer. It checks the R1 scratch marker and uses only the local
Supabase CLI's throwaway anon/publishable key.

For a pair of distinct, temporary GoTrue users, the new live gate:

1. Registers both accounts using GoTrue HTTP and confirms actual
   access tokens and distinct session identifiers.
2. Bundles the **real public entrypoint** using the same workerd-safe
   pinned esbuild and Node built-in compatibility mapping proven
   in R7B; no changes are made to application source code.
3. Verifies unauthenticated requests return HTTP 401.
4. Sends a valid signed role-request HTTP POST using a real JWT.
   Requires 201 and confirms the persistent database row is
   `pending` with exact authenticated requester and target IDs.
5. Attempts to approve the request using its requester JWT. Requires
   HTTP 403 and that no unauthorized decision is persisted.
6. Calls GoTrue local logout; requires the previously issued,
   not-yet-expired token be denied HTTP 401 **before quota mutation**.
7. Confirms the other real user's JWT still reaches validation,
   then calls global logout and requires HTTP 401 for that JWT.
8. Confirms token tampering and GoTrue transport outage fail closed.
9. Removes test request, event, quota and GoTrue account rows and
   destroys local worker/temporary bundles. Production records
   and credentials are never accessed or printed.

The real Worker entrypoint has the same explicit config, restricted
login and session checks used by the source-only R7 production
candidate. Unlike R7B, no fixture exposes test SQL or privileged
operations through the HTTP boundary.

## Limits

- Cloudflare **local** workerd and Hyperdrive proxy are tested, not
  a Cloudflare-hosted Worker/Hyperdrive provisioned with production TLS.
- An unauthorized decision denial is verified, not approval by a
  fully provisioned administrator or dual-control promotion.
- Full managed Supabase disaster recovery and external encrypted
  backups remain unverified.
- No remote deployments, DNS, routes, hosted migrations, credentials,
  real users, or protected C3 workstream are modified.

**Source-only security review:** GO after green CI.
**Hosted Supabase / Cloudflare deployment:** HOLD.
**Production onboarding:** NO-GO.
