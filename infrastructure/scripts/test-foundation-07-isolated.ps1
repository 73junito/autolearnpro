# Foundation 7 isolated local integration gate. Never targets a linked/cloud project.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$workdir = 'F:\autolearnpro-foundation7-cli-recovery'
$project = 'autolearnpro-foundation7-cli-recovery'
$container = 'supabase_db_' + $project
$expectedApi = 'http://127.0.0.1:55221'
if (-not (Test-Path (Join-Path $workdir 'supabase/config.toml'))) { throw 'Isolated CLI project missing' }
$config = Get-Content (Join-Path $workdir 'supabase/config.toml') -Raw
if ($config -notmatch 'project_id\s*=\s*"autolearnpro-foundation7-cli-recovery"') { throw 'Refusing unexpected project ID' }
Push-Location $root
try {
  Write-Output '[1/7] CLI migration history'
  $migrations = @(Get-ChildItem 'supabase/migrations/*.sql')
  if ($migrations.Count -ne 9) { throw "Expected nine migrations; found $($migrations.Count)" }
  $history = @(docker exec $container psql -X -U postgres -d postgres -Atc 'select version from supabase_migrations.schema_migrations order by version')
  if ($LASTEXITCODE -ne 0 -or $history.Count -ne $migrations.Count) { throw 'Migration history incomplete' }
  foreach ($file in $migrations) { if ($history -notcontains $file.BaseName.Split('_')[0]) { throw "Migration not recorded: $($file.Name)" } }

  Write-Output '[2/7] Database table RLS'
  $rls = docker exec $container psql -X -U postgres -d postgres -Atc "SELECT count(*) || '/' || count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','alp_private') AND c.relkind='r' AND c.relname LIKE 'alp_%'"
  if ($LASTEXITCODE -ne 0 -or $rls -ne '6/6') { throw "RLS gate failed: $rls" }

  Write-Output '[3/7] Auth endpoint'
  $health = Invoke-WebRequest -Uri ($expectedApi + '/auth/v1/health') -UseBasicParsing -TimeoutSec 15
  if ($health.StatusCode -ne 200) { throw 'Auth health failed' }

  Write-Output '[4/7] SQL security checks (twice for repeatability)'
  foreach ($pass in 1..2) {
    foreach ($file in (Get-ChildItem 'tests/foundation-07-*.sql' | Sort-Object Name)) {
      docker cp $file.FullName ($container + ':/tmp/' + $file.Name) 2>$null
      if ($LASTEXITCODE -ne 0) { throw "SQL copy failed: $($file.Name)" }
      $output = docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f ('/tmp/' + $file.Name) 2>&1
      if ($LASTEXITCODE -ne 0) { Write-Output ($output | Select-Object -Last 8); throw "SQL test failed: $($file.Name)" }
      Write-Output "  PASS [$pass] $($file.Name)"
    }
  }

  Write-Output '[5/7] Foundation validation and unit tests'
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'npm test failed' }

  Write-Output '[6/7] Live local Auth/approval integration'
  $values = @{}
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $statusLines = @(supabase status --workdir $workdir -o env 2>$null)
  $ErrorActionPreference = $previousPreference
  if ($LASTEXITCODE -ne 0) { throw 'Local Supabase status failed' }
  foreach ($line in $statusLines) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
  }
  if (-not $values.ContainsKey('DB_URL')) { throw 'Local DB URL missing' }
  $key = if ($values.ContainsKey('PUBLISHABLE_KEY')) { $values['PUBLISHABLE_KEY'] } else { $values['ANON_KEY'] }
  if (-not $key) { throw 'Local publishable key missing' }
  $env:ALP_DATABASE_URL = $values['DB_URL']
  $env:ALP_SUPABASE_URL = $expectedApi
  $env:ALP_SUPABASE_PUBLISHABLE_KEY = $key
  $env:ALP_LOCAL_INTEGRATION = '1'
  node --test tests/role-approval-live.test.mjs tests/approval-shared-quota-live.test.mjs tests/role-session-revocation-live.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Live integration failed' }

  Write-Output '[7/7] Auth remains responsive after tests'
  $health = Invoke-WebRequest -Uri ($expectedApi + '/auth/v1/health') -UseBasicParsing -TimeoutSec 15
  if ($health.StatusCode -ne 200) { throw 'Post-test Auth health failed' }
  Write-Output 'FOUNDATION_07_ISOLATED_GATE=PASS'
} finally {
  Remove-Item Env:ALP_DATABASE_URL,Env:ALP_SUPABASE_URL,Env:ALP_SUPABASE_PUBLISHABLE_KEY,Env:ALP_LOCAL_INTEGRATION -ErrorAction SilentlyContinue
  Pop-Location
}
