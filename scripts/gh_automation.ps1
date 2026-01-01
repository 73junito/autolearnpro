$ErrorActionPreference='Stop'
Write-Host "Starting gh automation..."
$searchPaths=@(
 'C:\Program Files\GitHub CLI\gh.exe',
 'C:\Program Files\GitHub CLI\bin\gh.exe',
 'C:\ProgramData\chocolatey\bin\gh.exe',
 "$env:ProgramFiles\GitHub CLI\gh.exe",
 "$env:ProgramFiles(x86)\GitHub CLI\gh.exe"
)
$found=$null
foreach($p in $searchPaths) { if(Test-Path $p){ $found=$p; break } }
if(-not $found){
  try {
    $found = Get-ChildItem 'C:\Program Files' -Filter 'gh.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { $_.FullName }
  } catch {}
}
if(-not $found){ Write-Host "gh.exe not found in common locations."; exit 2 }
$dir=Split-Path $found -Parent
Write-Host "Found gh at $found. Adding $dir to PATH for this session."
$env:Path = "$env:Path;$dir"
try {
  setx PATH "$($env:Path)" | Out-Null
  Write-Host "Persisted PATH via setx (you may need to restart shells)."
} catch { Write-Warning "Failed to persist PATH: $_" }
Write-Host "Verifying gh version..."
& "$found" --version
Write-Host "Checking auth status..."
$authOk = $false
try {
  & "$found" auth status 2>$null
  $authOk = $true
} catch {
  Write-Host "Not authenticated. Running 'gh auth login --web' (browser required)."
  & "$found" auth login --web
}
Write-Host "Creating PR (if not exists)..."
$prExists= $false
try {
  $prs = & "$found" pr list --head ci/fix-test-coverage-workflow --json number --jq '.[].number' 2>$null
  if($prs) { $prExists = $true; Write-Host "PR already exists: $prs" }
} catch {}
if(-not $prExists){
  & "$found" pr create --base main --head ci/fix-test-coverage-workflow --title "CI: Fix test-coverage workflow" --body-file docs/PR_CI_FIX.md
}
Write-Host "Done."