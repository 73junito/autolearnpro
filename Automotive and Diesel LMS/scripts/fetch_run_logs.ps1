param([string]$runId='20355947145')
$owner='73junito'
$repo='autolearnpro'
$outZip="D:\Automotive and Diesel LMS\scripts\run${runId}_logs.zip"
$outDir="D:\Automotive and Diesel LMS\scripts\run${runId}_logs"
if (-not $env:GITHUB_PAT) { Write-Error 'GITHUB_PAT environment variable not set'; exit 2 }
$url = "https://api.github.com/repos/$owner/$repo/actions/runs/$runId/logs"
Write-Output "Downloading $url"
Invoke-WebRequest -Uri $url -Headers @{ 'User-Agent'='vscode'; 'Authorization' = "Bearer $env:GITHUB_PAT" } -OutFile $outZip -ErrorAction Stop
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null
Expand-Archive -Path $outZip -DestinationPath $outDir -Force
$files = Get-ChildItem -Path $outDir -Recurse -File | Where-Object { $_.Length -gt 0 }
Write-Output ("EXTRACTED_FILES:$($files.Count)")
foreach ($f in $files) {
    Write-Output "---- $($f.FullName) ----"
    Get-Content -Path $f.FullName -Tail 200
}
