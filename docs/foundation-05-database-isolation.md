# Foundation 5 — isolated disposable database

This is a **PostgreSQL-only smoke test**, NOT Supabase or an application schema.

## Safety boundaries

- Compose project: `autolearnpro-db-smoke`; distinct from every existing project.
- No published host ports; dedicated internal-only Docker network.
- Database data is tmpfs (memory only) and disappears when the container stops.
- No legacy connection strings, auth settings, migrations, data, or credentials.
- Uses a test-only password supplied at runtime via `ALP_FOUNDATION_DB_PASSWORD`; never commit or reuse a real password.
- No `docker system prune`, `down -v`, `supabase db reset`, or operations on legacy services.

## PowerShell smoke test

From `F:\autolearnpro`:

```powershell
$env:ALP_FOUNDATION_DB_PASSWORD = [guid]::NewGuid().ToString('N')
docker compose -f infrastructure/docker/database-smoke.compose.yaml config --quiet
docker compose -f infrastructure/docker/database-smoke.compose.yaml up -d --wait --wait-timeout 90
docker compose -f infrastructure/docker/database-smoke.compose.yaml ps
docker compose -f infrastructure/docker/database-smoke.compose.yaml exec -T postgres psql -U alp_smoke -d alp_smoke -tAc "select current_database(),current_user"
docker compose -f infrastructure/docker/database-smoke.compose.yaml down
Remove-Item Env:ALP_FOUNDATION_DB_PASSWORD
```

Before application migrations: select a dedicated Supabase project, create its isolated configuration, define schema and RLS requirements, and validate backups/restore. A passing PostgreSQL smoke test does **not** validate any of those.
