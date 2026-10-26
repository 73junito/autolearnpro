# Supabase CLI and MCP isolation — Foundation 7

## Local database

Run local CLI operations from `F:\autolearnpro` using `--workdir F:\autolearnpro` and local-only flags. The local project is `autolearnpro-foundation6` (API port 55121; PostgreSQL 55122). Never run `supabase db push`, `link`, `config push`, or cloud migrations during this recovery.

Cline's existing `supabase/config.toml` health timeout change (2m to 5m) is preserved and uncommitted pending evidence.

The CLI version is 2.122.0. Environment variables `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` exist; values must never be printed. A missing `C:\Users\rod63\.supabase\profile` was noted, but its causal link to failed local PostgreSQL connection restoration is unproven. Do not create dummy profile credentials.

The database Docker volume `supabase_db_autolearnpro-foundation6` must be preserved. A read-only local archive was created under `infrastructure/backups` and locally excluded from Git. The Supabase CLI startup reported `Starting database from backup` and `Connection terminated unexpectedly`; separate direct PostgreSQL health from the CLI restore step.

## Cloud MCP

The VS Code Supabase remote MCP host is `mcp.supabase.com`. The user-level Cline configuration now contains a project-scoped read-only server `supabase-autolearnpro-readonly`, targeting project `nbgvllelsfhnmuwuqlkw` with `features=database,docs`. It does not target `dmtnuvhzmgfavglyjwsl` (autolearnpro.com), TorqueMind, or other projects. OAuth may require sign-in when Cline restarts. Verify the connection in Cline before trusting it; never use cloud MCP to repair the Docker container.

## Release gates

Do not claim Foundation 7 ready until isolated local services are healthy, nine migrations replay, SQL security tests and all live HTTP tests pass, and no cloud modifications occur. No GitHub push or deployment is authorized.
