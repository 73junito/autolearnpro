# Foundation 7 — role approval service release gates

## Verified local foundation
- Clean CLI replay of migrations `20261026015452`, `20261026015846`, `20261026020917`, `20261026021955` succeeded.
- `tests/foundation-07-role-management.sql` passed after replay.
- `tests/foundation-07-auth-api.ps1` passed after replay: two Auth JWTs, owner-only profile access, client role assignment denied, profile ownership change denied, test accounts deleted.

## Mandatory server-side approval workflow before release
1. Require valid signed-in JWT on any approval request; verify identity server-side with Supabase Auth. Ignore client-supplied actor ID, role claims from user metadata, and authorization flags.
2. Create a request workflow with pending/approved/rejected states. Record target, requested role, requester, designated reviewer, decision time, rationale, and immutable audit trail. Prevent requesters from approving their own request.
3. Verify reviewer privilege using server-controlled role assignments and distinct role approval rules; restrict administrator grants to separately authorized trusted administrators with step-up authentication or out-of-band control.
4. Use a server-only secret key and invoke `alp_private.manage_role` strictly after a successful approval. Do not expose this function through REST or put the service key in client bundles, logs, or test snapshots.
5. Make grant/revoke/approval idempotent; secure against races and duplicate decisions; confirm audit-write and role-change atomicity. Add revocation and denial tests.
6. Negative tests: student self-approval, instructor-to-administrator escalation, forged JWT, expired token, wrong reviewer, actor ID spoofing, replayed approval, missing rationale, and unauthorized audit access.
7. Only after tests, check Supabase advisor and cloud migration history; do not deploy Foundation 7 until a distinct cloud approval has been reviewed.

**Current limitation:** `manage_role` accepts `p_actor_id` from trusted server code; it does not authenticate the actor by itself. It must not be exposed to user-controlled requests or treated as a complete approval workflow. All work remains local, and no cloud deployment occurred.
