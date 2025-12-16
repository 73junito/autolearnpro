param(
  [long]$RunId = 20238428742
)

$path = "D:\Automotive and Diesel LMS\actions-$RunId-logs\1_build-and-push.txt"
if (-not (Test-Path $path)) { Write-Error "Log file not found: $path"; exit 1 }

$content = Get-Content -LiteralPath $path -ErrorAction Stop
$match = Select-String -Path $path -Pattern 'sed -n' -SimpleMatch | Select-Object -First 1
if (-not $match) { Write-Output "No 'sed -n' line found in $path"; exit 0 }

$lineNumber = $match.LineNumber
$startIndex = [Math]::Max(0, $lineNumber - 1)
$endIndex = [Math]::Min($content.Length - 1, $startIndex + 20)

Write-Output "Found 'sed -n' at line $lineNumber; printing lines $lineNumber..($lineNumber+20) (or until EOF):"
$content[$startIndex..$endIndex] | ForEach-Object { Write-Output $_ }
