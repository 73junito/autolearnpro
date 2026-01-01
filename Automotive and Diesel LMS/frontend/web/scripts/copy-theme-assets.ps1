# Copies theme assets into the frontend public directory so Next.js can serve them.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\copy-theme-assets.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

# Try to locate the repository root by searching upward for a `theme` folder.
$curr = Get-Item $scriptDir
$repoRoot = $null
while ($curr -ne $null) {
  $maybe = Join-Path $curr.FullName "theme"
  if (Test-Path $maybe) {
    $repoRoot = $curr.FullName
    break
  }
  $curr = $curr.Parent
}
if (-not $repoRoot) {
  # Fallback to the original heuristic (three levels up). If that fails, error out.
  $fallback = Resolve-Path "..\..\.." -ErrorAction SilentlyContinue
  if ($fallback) {
    $repoRoot = $fallback.Path
  } else {
    Write-Host "Could not determine repository root or find 'theme' folder." -ForegroundColor Red
    exit 1
  }
}

$source = Join-Path $repoRoot "theme\assets"
$dest   = Resolve-Path (Join-Path $scriptDir "..\public") | Select-Object -ExpandProperty Path

Write-Host "Copying theme assets from: $source" -ForegroundColor Cyan
Write-Host "To frontend public dir:    $dest" -ForegroundColor Cyan

# Use robocopy for robust copy on Windows
$robocopyArgs = @($source, $dest, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS")
$rc = & robocopy @robocopyArgs

if ($LASTEXITCODE -ge 8) {
  Write-Host "robocopy failed with exit code $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Theme assets copied." -ForegroundColor Green
