# Foundation 7 — Controlled role management (local only)

Migration: `20261026021955_controlled_role_grants.sql`.

- Private `alp_private.manage_role` is `SECURITY INVOKER`, not exposed through Supabase REST, and only the trusted `service_role` has EXECUTE. `anon` and `authenticated` have no access to the function or schema.
- The function accepts `user_id`, role (`student`, `instructor`, `administrator`), action (`grant` or `revoke`), trusted backend-supplied `actor_id`, and required reason (8–500 chars).
- The private `alp_role_audit` table records requested changes and has RLS enabled and forced. The server role is granted INSERT but not SELECT; read-only audit inspection requires a database administrator.
- `tests/foundation-07-role-management.sql` runs in a rollback-only transaction: a client cannot call the function; trusted `service_role` can grant/revoke; corresponding audit entries are verified by the database owner. No test users or grants persist.

**Important:** This is an internal backend primitive, not a completed human approval workflow. A future trusted API must authenticate and authorize the real actor, check approval policy, and provide verified actor ID and reason. Never accept the actor ID from an untrusted client. The `service_role` key must remain server-only. No cloud deployment or GitHub push was performed.
