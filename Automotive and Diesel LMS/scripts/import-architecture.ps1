<#
Import architecture DOCX files into the repo, extract embedded images, and optionally commit.

Usage examples:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-architecture.ps1 \
    -Files \'
    C:\Users\rod63\Downloads\Updated_Architecture_Diagram_Full_Feature.docx',\
    \"C:\Users\rod63\Downloads\Updated_Architecture_Diagram_Enterprise_Accreditation_Edition.docx\",\
    'C:\Users\rod63\Downloads\Updated_Architecture_Diagram_Full_Feature_All_Options.docx'\' 

Parameters:
  -Files: array of source DOCX file paths
  -Dst: destination folder under repository (default: docs/architecture)
  -Commit: switch to perform git add/commit (default: no commit)
#>

param(
  [Parameter(Mandatory=$true)]
  [string[]]$Files,
  [string]$Dst = "D:\Automotive and Diesel LMS\docs\architecture",
  [switch]$Commit
)

function Write-Info($m) { Write-Host $m -ForegroundColor Cyan }
function Write-OK($m) { Write-Host $m -ForegroundColor Green }
function Write-Err($m) { Write-Host $m -ForegroundColor Red }

if (-not (Test-Path -Path $Dst)) { New-Item -ItemType Directory -Path $Dst -Force | Out-Null }
$assets = Join-Path $Dst 'assets'
if (-not (Test-Path -Path $assets)) { New-Item -ItemType Directory -Path $assets -Force | Out-Null }

$added = @()

foreach ($f in $Files) {
  if (-not $f) { continue }
  if (-not (Test-Path -Path $f)) { Write-Err "Source missing: $f"; continue }
  try {
    Write-Info "Copying: $f -> $Dst"
    Copy-Item -Path $f -Destination $Dst -Force
    $added += (Join-Path $Dst (Split-Path $f -Leaf))

    # extract media from docx (docx is a zip archive)
    $base = [IO.Path]::GetFileNameWithoutExtension($f) -replace '\s','_'
    $tempZip = Join-Path $env:TEMP ($base + '_' + [Guid]::NewGuid().ToString() + '.zip')
    Copy-Item -Path $f -Destination $tempZip -Force
    $unzipDir = Join-Path $env:TEMP ($base + '_docx_unzip_' + [Guid]::NewGuid().ToString())
    Expand-Archive -Path $tempZip -DestinationPath $unzipDir -Force
    $mediaDir = Join-Path $unzipDir 'word\media'
    if (Test-Path $mediaDir) {
      Get-ChildItem -Path $mediaDir -File | ForEach-Object {
        $destName = "$base`_$_.Name"
        $dest = Join-Path $assets $destName
        Copy-Item -Path $_.FullName -Destination $dest -Force
        Write-OK "  Extracted: $($_.Name) -> assets/$destName"
        $added += $dest
      }
    } else {
      Write-Info "  No embedded media found in: $f"
    }
    # cleanup
    Remove-Item -Recurse -Force $unzipDir -ErrorAction SilentlyContinue
    Remove-Item -Force $tempZip -ErrorAction SilentlyContinue
  } catch {
    Write-Err (("Error handling {0}: {1}" -f $f, $_))
  }
}

if ($Commit) {
  try {
    Set-Location -LiteralPath 'D:\Automotive and Diesel LMS'
    git add docs/architecture/* | Out-Null
    $msg = 'Add architecture DOCX files and extracted images'
    git commit -m $msg
    Write-OK 'Committed architecture files to git.'
  } catch {
    Write-Err "Git commit failed: $_"
  }
} else {
  Write-Info 'Run with -Commit to git add/commit the copied files.'
}

Write-OK 'Done.'
