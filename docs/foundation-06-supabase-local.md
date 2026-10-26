# Foundation 6: Separate local Supabase instance

Supabase CLI: 2.122.0. Local project ID: `autolearnpro-foundation6`.

The new project is **not** the existing `Car_Diagnosis_Simulator` stack, and **not** the independent `autolearnpro_dev` PostgreSQL / pgAdmin database (port 55432). Do not assume these databases share data or migration history.

## Configured localhost ports
- API: 55121
- Supabase database: 55122
- Studio: 55123
- Mail: 55124
- Analytics: 55127
- Shadow database: 55120
- Pooler (disabled): 55129

The configuration explicitly sets `auto_expose_new_tables = false`. No legacy data, credentials, application schema, or users have been migrated.

## Local CLI

From `F:\autolearnpro`:
```powershell
supabase start --exclude imgproxy,vector,logflare --yes
supabase status
```

Never run `supabase stop --no-backup`, `supabase db reset`, or volume pruning without verifying the exact project and safeguarding data. The existing `supabase/migrations/20261026012231_establish_private_security_baseline.sql` was originally applied to the standalone `autolearnpro_dev` database via psql. Verify separate migration application/history on the new Supabase database before continuing with RLS and application tables.

## Remaining validation gates
Check Supabase container health, SQL migrations, database RLS/grants, Auth sign-in and token handling, API table exposure, network isolation, and restore from backup before labeling Foundation 6 production-ready.
