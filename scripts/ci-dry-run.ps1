param(
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro'
)

# Simple CI dry-run wrapper that invokes helper scripts with -DryRun
# Captures logs to a timestamped file under .\scripts\logs\

$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$logDir = Join-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) -ChildPath 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "ci-dry-run-$timestamp.log"

function Run-ScriptDryRun {
  param(
    [string]$ScriptPath,
    [string[]]$Args
  )
  Write-Output "\n--- Running: $ScriptPath -DryRun $($Args -join ' ') ---\n"
  $cmd = "pwsh -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -DryRun $($Args -join ' ')"
  Write-Output "Command: $cmd" | Tee-Object -FilePath $logFile -Append
  try {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -DryRun @Args *>&1 | Tee-Object -FilePath $logFile -Append
    Write-Output "Exit: Success" | Tee-Object -FilePath $logFile -Append
    return $true
  } catch {
    Write-Output "Exit: Failure - $($_.Exception.Message)" | Tee-Object -FilePath $logFile -Append
    return $false
  }
}

# List of helper scripts to dry-run (relative to repo root)
$scriptsToRun = @(
  'scripts\add-file-via-gitdata.ps1',
  'scripts\add-lib-to-branch.ps1',
  'scripts\commit-file-to-branch.ps1',
  'scripts\dispatch-pr.ps1',
  'scripts\monitor-pr-workflow.ps1'
)

$allSucceeded = $true
foreach ($s in $scriptsToRun) {
  $full = Join-Path (Get-Location) $s
  if (-not (Test-Path $full)) {
    Write-Output "SKIP: $s not found" | Tee-Object -FilePath $logFile -Append
    $allSucceeded = $false
    continue
  }
  $ok = Run-ScriptDryRun -ScriptPath $full -Args @("-Owner", $Owner, "-Repo", $Repo)
  if (-not $ok) { $allSucceeded = $false }
}

Write-Output "\nCI Dry Run complete. Log: $logFile"
if ($allSucceeded) { exit 0 } else { exit 2 }
