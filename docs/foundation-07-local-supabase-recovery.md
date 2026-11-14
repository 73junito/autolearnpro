# Foundation 7 local Supabase recovery runbook

## Scope
Validated on 2026-10-26. This runbook uses only the **separate local** recovery project at `F:\autolearnpro-foundation7-cli-recovery`, not the original CLI project or any cloud project.

- Main repository: `F:\autolearnpro`; branch `foundation/07-identity-authorization`
- Isolated CLI project: `F:\autolearnpro-foundation7-cli-recovery`
- Recovery API: `http://127.0.0.1:55221`
- Recovery PostgreSQL: `127.0.0.1:55222`
- Original volume: `supabase_db_autolearnpro-foundation6` (do not alter)
- Separate preserved PostgreSQL clone: `foundation6-recovery-clone`
- Pre-recovery archive: `F:\autolearnpro\infrastructure\backups\foundation6-postgres-pre-recovery.tar.gz`

## Start and verify
From PowerShell:

```powershell
$recovery = 'F:\autolearnpro-foundation7-cli-recovery'
supabase start --workdir $recovery --exclude studio,postgres-meta,logflare,vector,edge-runtime,supavisor,imgproxy
supabase status --workdir $recovery
docker ps --filter 'name=autolearnpro-foundation7-cli-recovery' --format 'table {{.Names}}\t{{.Status}}'
(Invoke-WebRequest -Uri 'http://127.0.0.1:55221/auth/v1/health' -UseBasicParsing -TimeoutSec 15).StatusCode
supabase migration list --local --workdir $recovery
```

Expected Auth HTTP status: 200. Database, Auth, Kong, Realtime, Storage and Mailpit have been observed healthy. The REST container was observed running. The first-time PostgreSQL bootstrap was slow; do not assume failure solely from a delayed startup message.

## Migration and test evidence
- `supabase migration up --local --workdir F:\autolearnpro-foundation7-cli-recovery` applied all nine Foundation 7 migration files successfully.
- Five `tests/foundation-07-*.sql` checks passed against the CLI-managed recovery PostgreSQL database.
- All three live tests passed: approval lifecycle, shared persistent quota, and session revocation.
- The two Auth-related test files currently hard-code `127.0.0.1:55121`; temporary copies changed that assertion to `55221` for this isolated run, and the copies were removed. Prefer making future tests parameterize the loopback port.
- Ordinary `npm test` was previously 3/3 on the recovery branch.

## Configuration reconciliation
The original `F:\autolearnpro\supabase\config.toml` is **not verified** with the original Docker volume. It currently has an uncommitted diagnostic edit: DB port `55122 -> 55132`, health timeout `2m -> 5m`, and an extra final blank line. Preserve this diff until the original-local cutover is expressly planned. The successful isolated project uses API `55221`, DB `55222`, and health timeout `5m`; copying its project ID or port settings over the original is **not** an established fix.

## Safety
Never run `supabase db reset`, `supabase stop --no-backup`, `supabase stop --all`, or `docker volume prune` as a shortcut. Do not link to or change any cloud Supabase project. Do not print or commit local authentication keys or database passwords. The isolated recovery project is for local integration testing and may use CLI-provided development credentials.

## Outstanding
Restore/replace the original project's CLI-managed stack only via a separately reviewed, volume-preserving plan. Until then, use the isolated CLI project for integration tests and do not claim the original is restored.
