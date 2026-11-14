# Foundation 6 — Initial database security baseline

Scope: new local **PostgreSQL** development database `autolearnpro_dev`, hosted by `autolearnpro-local-admin-postgres-1`. This is NOT a complete Supabase installation; no Supabase Auth, REST Data API, Studio, Realtime, or storage have been provisioned for the new project.

## Completed
- Created the versioned file via Supabase CLI 2.122.0: `supabase/migrations/20261026012231_establish_private_security_baseline.sql`.
- Established schema `alp_private`, revoked public schema/table/sequence grants, and explicitly revoked roles `anon` / `authenticated` if they exist.
- Created `alp_private.foundation_audit` with RLS **enabled and forced**, without permissive policies or public grants.
- Ran SQL locally against the isolated PostgreSQL database and verified RLS flags.

## Important limits
- This first migration was executed directly via psql, **not** via the Supabase migration tracking subsystem. Do not assume Supabase migration history is synchronized.
- The table is an internal security smoke-test table, not a ready-to-use audit service.
- No user identities or permissions should be migrated or provisioned from the legacy stack.
- Production API/role permissions, authentication, restore testing and security advisors are still pending. Avoid `supabase db reset`, `supabase link`, `supabase db push`, and `down -v` on any existing environments.
- Separate the new full Supabase project by its own project ID, port assignments, and Docker resources before enabling managed services.

## Verification
```powershell
docker exec autolearnpro-local-admin-postgres-1 psql -U alp_admin -d autolearnpro_dev -tAc "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='alp_private.foundation_audit'::regclass;"
```
Expected output: `t|t`.
