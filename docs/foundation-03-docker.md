# Foundation 3: isolated Docker smoke test

Compose project: `autolearnpro-foundation`. One disposable BusyBox healthcheck container, no host ports and no persistent volumes. Internal-only bridge network. No link to legacy Supabase, no Docker socket access.

Run from repository root:

```powershell
docker compose -f infrastructure/docker/compose.yaml config --quiet
docker compose -f infrastructure/docker/compose.yaml up -d
docker compose -f infrastructure/docker/compose.yaml ps
docker compose -f infrastructure/docker/compose.yaml down
```

This is an infrastructure smoke test, not the production stack. Avoid `down -v`, prune and Docker Desktop resets.
