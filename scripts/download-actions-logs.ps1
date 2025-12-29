param(
  [long]$RunId = 20238428742,
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro'
)

$secure = Read-Host -AsSecureString 'Enter GitHub PAT to download Actions logs'
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

$headers = @{ Authorization = "Bearer $pat"; 'User-Agent' = 'autolearnpro-agent'; Accept = 'application/vnd.github+json' }
$outZip = "actions-$RunId-logs.zip"
$uri = "https://api.github.com/repos/$Owner/$Repo/actions/runs/$RunId/logs"

Write-Host "Downloading logs for run $RunId..."
Invoke-WebRequest -Uri $uri -Headers $headers -OutFile $outZip -UseBasicParsing

$dest = Join-Path $PWD ("actions-$RunId-logs")
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Expand-Archive -LiteralPath $outZip -DestinationPath $dest
Write-Host "Logs saved to $dest"
