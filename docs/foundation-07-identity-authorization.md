# Foundation 7 — Identity and authorization baseline

## Scope
Local-only migration: `supabase/migrations/20261026020917_identity_authorization_baseline.sql`. The selected Supabase cloud project `autolearnpro.com` (`dmtnuvhzmgfavglyjwsl`) has **not** received this migration.

## Design
- `public.alp_profiles`: Auth UUID foreign key, limited display name, ownership-scoped SELECT/INSERT/UPDATE policies. Authenticated users may update **only** `display_name`; never `user_id` or `created_at`.
- `alp_private.alp_role_assignments`: keyed by user ID and one of `student`, `instructor`, `administrator`. RLS enabled/forced, no client grants or policies. Assignment is reserved for a future audited server-only operation; never infer roles from user-editable metadata.
- Auth sign-in does not automatically provision profiles or grant elevated roles. No course or assessment permissions are introduced yet.

## Local verification
- Applied SQL to dedicated local Supabase database with `ON_ERROR_STOP=1`: passed.
- Three profile RLS policies; zero role-assignment RLS policies.
- Authenticated profile SELECT: true; role-assignment SELECT/INSERT: false.
- Authenticated UPDATE of profile `user_id`: false; UPDATE of `display_name`: true.
- Both tables: row security enabled and forced.

## Remaining gates
- This validation did not cover authenticated end-to-end API tests with two real accounts, instructor approvals, trusted-server role management, enrollment scoping, schema migration reset/replay, or cloud deployment.
- SQL was iterated locally via psql and is not yet recorded in the local Supabase migration-history table. Reconcile through migration tooling before claiming a clean reproducible database setup.
- Avoid any cloud migration or deployment until full negative authorization and clean replay tests pass.
