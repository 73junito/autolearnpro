#!/usr/bin/env pwsh
# add_site_logo_fixed.ps1
# Copy a provided logo image into the project public images and generate a favicon.
# Usage: .\scripts\add_site_logo_fixed.ps1 -SourcePath "C:\path\to\logo.png"

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$SourcePath,
    [switch]$Force
)

# Default paths (set here to avoid parser issues in the param block)
$ImagesDir = '.\frontend\web\public\images'
$FaviconPath = '.\frontend\web\public\favicon.ico'

function Write-ErrAndExit($msg){ Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

try {
    $src = Resolve-Path -Path $SourcePath -ErrorAction Stop
} catch {
    Write-ErrAndExit "Source file not found: $SourcePath"
}

# Ensure images directory exists
if (-not (Test-Path -Path $ImagesDir)){
    New-Item -ItemType Directory -Path $ImagesDir -Force | Out-Null
}

$destLogo = Join-Path (Resolve-Path -Path $ImagesDir).ProviderPath "logo.png"

Write-Host "Copying logo to: $destLogo"

# If input is SVG or other format, prefer ImageMagick for conversion; otherwise copy and rename to PNG
try{
    $magick = Get-Command magick -ErrorAction SilentlyContinue
} catch { $magick = $null }

if ($magick) {
    Write-Host "ImageMagick found — converting source to PNG and normalizing size..."
    & magick "$($src.ProviderPath)" -auto-orient -background none -resize '2000x2000>' -strip "$destLogo"
    if ($LASTEXITCODE -ne 0) { Write-ErrAndExit "ImageMagick failed to convert the image." }
} else {
    Write-Host "ImageMagick not found — copying source to $destLogo (will try to keep original format)."
    Copy-Item -Path $src.ProviderPath -Destination $destLogo -Force
}

# Create favicon
try{
    $faviconDir = Split-Path -Path $FaviconPath -Parent
    if (-not (Test-Path -Path $faviconDir)) { New-Item -ItemType Directory -Path $faviconDir -Force | Out-Null }

    if ($magick) {
        Write-Host "Generating favicon.ico at: $FaviconPath"
        & magick "$destLogo" -resize 64x64 "$FaviconPath"
        if ($LASTEXITCODE -ne 0) { Write-ErrAndExit "ImageMagick failed to write favicon.ico." }
    } else {
        $pngFav = Join-Path $faviconDir "favicon.png"
        Copy-Item -Path $destLogo -Destination $pngFav -Force
        Write-Host "ImageMagick not available — created PNG favicon at: $pngFav"
        Write-Host "Browsers commonly request /favicon.ico; consider installing ImageMagick or converting the PNG to .ico manually."
    }
}
catch{
    Write-ErrAndExit $_.Exception.Message
}

Write-Host "Done. Logo available at: /images/logo.png"
if ($magick) { Write-Host "Favicon available at: /favicon.ico" } else { Write-Host "Favicon available at: /favicon.png" }
