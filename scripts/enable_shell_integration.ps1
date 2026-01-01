<#
enable_shell_integration.ps1
Adds a small set of PowerShell helper functions to the user's PowerShell profile
so command detection (package manager, npm scripts) is easier for local workflows.

Usage (run once):
  pwsh -ExecutionPolicy Bypass -File .\scripts\enable_shell_integration.ps1
#>

$profilePath = $PROFILE
$backupPath = "$profilePath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"

Write-Host "PowerShell profile: $profilePath"

# Ensure profile directory exists
$profileDir = Split-Path -Parent $profilePath
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }

# Backup existing profile if present
if (Test-Path $profilePath) {
    Copy-Item -Path $profilePath -Destination $backupPath -Force
    Write-Host "Backed up existing profile to: $backupPath"
} else {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
    Write-Host "Created new profile at: $profilePath"
}

$snippet = @'
# === Shell integration helpers added by enable_shell_integration.ps1 ===
function Get-ProjectPackageManager {
    if (Test-Path -Path (Join-Path $PWD 'pnpm-lock.yaml')) { 'pnpm' }
    elseif (Test-Path -Path (Join-Path $PWD 'yarn.lock')) { 'yarn' }
    elseif (Test-Path -Path (Join-Path $PWD 'package-lock.json')) { 'npm' }
    else { 'npm' }
}

function Show-PackageScripts {
    param([string]$Path = $PWD)
    $pkg = Join-Path $Path 'package.json'
    if (-not (Test-Path $pkg)) { Write-Host "No package.json found in $Path"; return }
    try {
        $json = Get-Content $pkg -Raw | ConvertFrom-Json
        if ($json.scripts) {
            Write-Host "package.json scripts:" -ForegroundColor Cyan
            $json.scripts.PSObject.Properties | ForEach-Object { Write-Host " - $($_.Name): $($_.Value)" }
        } else {
            Write-Host "No scripts defined in package.json"
        }
    } catch {
        Write-Host "Failed to parse package.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Run-ProjectScript {
    param(
        [Parameter(Mandatory=$true)][string]$ScriptName,
        [string[]]$Args
    )
    $pm = Get-ProjectPackageManager
    Write-Host "Detected package manager: $pm"
    switch ($pm) {
        'pnpm' { pnpm run $ScriptName -- @Args }
        'yarn' { yarn $ScriptName @Args }
        default { npm run $ScriptName -- @Args }
    }
}

Set-Alias pscripts Show-PackageScripts -Scope Global
Set-Alias rscript Run-ProjectScript -Scope Global
# === end helpers ===
'@

Add-Content -Path $profilePath -Value $snippet -Encoding UTF8
Write-Host "Appended shell integration snippet to profile. Restart PowerShell for changes to take effect." -ForegroundColor Green
