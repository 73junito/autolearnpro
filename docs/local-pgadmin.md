# Local PostgreSQL administration — AutoLearnPro

Separate from Foundation 5's **disposable** database smoke test, this stack provides a persistent **development-only** PostgreSQL 17.6 database and pgAdmin 4 9.18.

- UI: http://127.0.0.1:5055 (only local loopback published)
- Login email: admin@autolearnpro.local
- Local login password and database password: `infrastructure/docker/.env.local-admin` (git-ignored; do not commit or share)
- pgAdmin server registration: **Name** AutoLearnPro Local Dev, **Host** `postgres`, **Port** `5432`, **Maintenance database** `autolearnpro_dev`, **Username** `alp_admin`, **Password** value of `ALP_LOCAL_DB_PASSWORD` from the local credential file
- Docker Compose project: `autolearnpro-local-admin`. Separate named database and admin volumes.
- No external PostgreSQL host port exposed, no production/Supabase connection, and no application schema migrated.

## Operations (PowerShell, from F:\autolearnpro)

Start:
```powershell
docker compose --env-file infrastructure/docker/.env.local-admin -f infrastructure/docker/local-admin.compose.yaml up -d --wait
```

Status:
```powershell
docker compose --env-file infrastructure/docker/.env.local-admin -f infrastructure/docker/local-admin.compose.yaml ps
```

Stop containers, **retain** data:
```powershell
docker compose --env-file infrastructure/docker/.env.local-admin -f infrastructure/docker/local-admin.compose.yaml down
```

SQL smoke check:
```powershell
docker compose --env-file infrastructure/docker/.env.local-admin -f infrastructure/docker/local-admin.compose.yaml exec -T postgres psql -U alp_admin -d autolearnpro_dev -tAc 'SELECT current_database(), current_user;'
```

Never run `down -v` unless deliberately destroying this new development database. Back up before meaningful data or migrations; named volumes are not backups. Credentials in the env file are plaintext on your local machine; restrict file access and do not upload it.
