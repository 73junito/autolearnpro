<#
.SYNOPSIS
Downloads and extracts artifacts for a GitHub Actions run robustly.

.DESCRIPTION
Uses `gh` to locate the latest run for a workflow+branch (or a provided run id),
downloads each artifact via the Actions API (as a zip), and extracts using
7-Zip, `tar`, or PowerShell `Expand-Archive` depending on the archive type.

Usage:
  powershell -ExecutionPolicy Bypass -File .\scripts\fetch_workflow_artifacts.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\fetch_workflow_artifacts.ps1 -Branch 'feat/thumbnailer-quality'

Parameters:
  -Workflow string: workflow filename (default: rust-thumbnailer-benchmark.yml)
  -Branch string: branch to find the latest run for
  -RunId string: (optional) use an explicit run id instead of finding latest
  -OutRoot string: output root dir
#>

param(
    [string]$Workflow = "rust-thumbnailer-benchmark.yml",
    [string]$Branch = "feat/thumbnailer-quality",
    [string]$RunId = "",
    [string]$OutRoot = "artifacts"
)

Set-StrictMode -Version Latest

function Fail([string]$msg){ Write-Error $msg; exit 2 }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)){
    Fail "gh CLI not found on PATH. Install GitHub CLI and authenticate first."
}

if (-not (Test-Path $OutRoot)) { New-Item -Path $OutRoot -ItemType Directory | Out-Null }

if (-not $RunId) {
    Write-Host "Finding latest run for workflow=$Workflow branch=$Branch"
    $RunId = gh run list --workflow=$Workflow --branch=$Branch --limit 1 --json databaseId --jq '.[0].databaseId'
    if (-not $RunId) { Fail "No run found for workflow $Workflow on branch $Branch" }
}

Write-Host "Using run id: $RunId"

$repo = gh repo view --json nameWithOwner --jq .nameWithOwner
if (-not $repo) { Fail "Unable to determine repository nameWithOwner via gh repo view" }

$dest = Join-Path $OutRoot "run-$RunId"
if (-not (Test-Path $dest)) { New-Item -Path $dest -ItemType Directory | Out-Null }

Write-Host "Querying artifacts for run via Actions API..."
# Use the Actions REST API because `gh run view --json artifacts` is not available in all gh versions
$apiPath = "repos/$repo/actions/runs/$RunId/artifacts"
$artifactsJson = gh api $apiPath | Out-String
if (-not $artifactsJson) { Fail "Failed to get artifacts for run $RunId via API" }

try {
    $artifactsObj = $artifactsJson | ConvertFrom-Json
} catch {
    Fail ([string]::Format("Failed to parse artifacts JSON: {0}", $_))
}

if (-not $artifactsObj.artifacts -or $artifactsObj.artifacts.Count -eq 0) {
    Write-Host "No artifacts found for run $RunId"; exit 0
}

foreach ($a in $artifactsObj.artifacts) {
    $id = $a.id
    $name = $a.name
    Write-Host "Downloading artifact: $name (id=$id)"
    $outZip = Join-Path $dest ($name + ".zip")

    # Download the artifact archive (zip) via the Actions API
    $apiPath = "repos/$repo/actions/artifacts/$id/zip"
    try {
        # gh api does not provide an -o flag on all versions; redirect stdout to save the binary zip
        Write-Host "Downloading artifact archive via gh api to $outZip"
        & gh api $apiPath --silent --method GET > $outZip
    } catch {
        Write-Warning ([string]::Format("gh api download failed for artifact {0}: {1}. Falling back to gh run download.", $name, $($_)))
        try { gh run download $RunId --name $name --dir $dest } catch { Fail ([string]::Format("Both API download and gh run download failed for {0}: {1}", $name, $($_))) }
        # If gh run download created files directly in $dest, continue to next artifact
        continue
    }

    if (-not (Test-Path $outZip)) { Fail "Download did not produce $outZip" }

    # Detect magic bytes
    $bytes = Get-Content -Path $outZip -Encoding Byte -TotalCount 4
    $magic = ($bytes | ForEach-Object { "{0:X2}" -f $_ }) -join '-'
    Write-Host "Magic bytes: $magic"

    $extractDir = Join-Path $dest ($name + "-extracted")
    if (-not (Test-Path $extractDir)) { New-Item -Path $extractDir -ItemType Directory | Out-Null }

    $sevenZip = "C:\Program Files\7-Zip\7z.exe"

    if ($magic -like '50-4B*') {
        Write-Host "Archive looks like ZIP; extracting..."
        if (Test-Path $sevenZip) {
            & $sevenZip x $outZip -o$extractDir -y | Out-Null
        } else {
            try { Expand-Archive -Path $outZip -DestinationPath $extractDir -Force } catch { Fail "Expand-Archive failed: $_" }
        }
    } elseif ($magic -eq '1F-8B-08-00') {
        Write-Host "Gzip detected; attempting tar extraction (tar is available on Windows 10+)."
        try { tar -xzf $outZip -C $extractDir } catch { Fail "tar extraction failed: $_" }
    } else {
        Write-Host "Unknown magic; trying 7-Zip then tar then Expand-Archive fallback."
        $extracted = $false
        if (Test-Path $sevenZip) {
            try { & $sevenZip x $outZip -o$extractDir -y | Out-Null; $extracted = $true } catch { Write-Warning "7z extraction failed" }
        }
        if (-not $extracted) {
            try { tar -tf $outZip; tar -xvf $outZip -C $extractDir; $extracted = $true } catch { Write-Warning "tar extraction failed" }
        }
        if (-not $extracted) {
            try { Expand-Archive -Path $outZip -DestinationPath $extractDir -Force; $extracted = $true } catch { Write-Warning "Expand-Archive failed" }
        }
        if (-not $extracted) { Write-Warning "Could not extract $outZip; file may be a non-archive or corrupted." }
    }

    Write-Host "Artifact $name processed into $extractDir"
}

Write-Host "All artifacts processed. See $dest"
