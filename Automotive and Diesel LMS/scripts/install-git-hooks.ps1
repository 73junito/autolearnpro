#!/usr/bin/env pwsh
Param()
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path -Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) '..')
$githooksDir = Join-Path $repoRoot '.githooks'
$gitHooksTarget = Join-Path $repoRoot '.git\hooks'

if (-not (Test-Path $githooksDir)) {
    Write-Error "No .githooks directory found at $githooksDir"
    exit 2
}

if (-not (Test-Path $gitHooksTarget)) {
    Write-Error ".git/hooks not found. Are you in a git repository?"
    exit 2
}

Write-Host "Installing hooks from $githooksDir -> $gitHooksTarget"
Get-ChildItem -Path $githooksDir -File | ForEach-Object {
    $src = $_.FullName
    $dest = Join-Path $gitHooksTarget $_.Name
    Copy-Item -Path $src -Destination $dest -Force
    Write-Host "Copied" $_.Name
}

# Attempt to make hooks executable on non-Windows shells if possible
if (Get-Command bash -ErrorAction SilentlyContinue) {
    try {
        & bash -lc "chmod +x $([System.IO.Path]::Combine('.git','hooks','*'))" | Out-Null
    } catch {}
}

Write-Host "Hooks installed."
exit 0
