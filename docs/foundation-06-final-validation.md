# Foundation 6 — local validation evidence

Target local project: `autolearnpro-foundation6` in `F:\autolearnpro`; selected cloud project: `autolearnpro.com` (`dmtnuvhzmgfavglyjwsl`).

## Verified
- Dedicated local Supabase services started successfully; database, Auth, Studio, storage, realtime and gateway reported healthy.
- Local CLI migration history: `20261026015452`, `20261026015846`; cloud Supabase MCP reported the same two versions.
- Local SQL: `anon` and `authenticated` have neither `USAGE` on `alp_private` nor `SELECT` on `alp_private.foundation_audit` (all false).
- Local RLS enabled and forced (`t|t`).
- Local Auth health endpoint returned HTTP 200. An unauthenticated request to `/rest/v1/foundation_audit` returned HTTP 404; do not treat this single request alone as complete API-authorization testing.
- Backup/restore smoke: dumped only `alp_private`, restored to a newly-created scratch database, verified both RLS flags true, removed the scratch database and dump, and checked no `alp_restore_check_%` databases remained.
- Cloud security advisor: one INFO notice for zero RLS policies on intentionally private `alp_private.foundation_audit`; deny-by-default is intentional.

## Limits and next gates
- This was a **schema-only** restore of the private namespace, not a tested full instance or point-in-time recovery procedure.
- Full Auth sign-in, user-owned row policies, storage permissions, and client SDK integration are pending application schema requirements.
- Supabase CLI warned local services are network-accessible (`0.0.0.0`) with development defaults; use host firewall restrictions and never expose these services publicly.
- No production deployment, GitHub push, or modification of legacy TorqueMind databases was performed.
