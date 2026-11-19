# Foundation 7 authorization integration test

Executed locally in `supabase_db_autolearnpro-foundation6` using `tests/foundation-07-rls.sql`.

- Transaction created two disposable entries in `auth.users`; no external test accounts were provisioned.
- As `authenticated`, identity A inserted and read its profile.
- Identity B could not see A's profile, could not insert under A's identifier, and could not read the private role assignment table.
- Identity A updated its own display name.
- `ROLLBACK` executed; no test identities or profile rows remain.
- The SQL test exits nonzero on unexpected behavior. Successful output includes `FOUNDATION_07_RLS_TRANSACTION_PASSED`.

## Caution

This test assumes the local Foundation 7 migration has already been applied. The first migration was executed by psql rather than the Supabase migration manager; therefore the migration-history record is still pending. A separate clean-project replay must be performed before cloud deployment. Do not use `supabase db reset` on a database holding user data.

Future test expansion: real Auth signup/login via API, authenticated JWT requests, update-owner denial, actual server-only role-assignment workflow, and instructor/admin course permission cases. Cloud project `dmtnuvhzmgfavglyjwsl` remains unchanged.
