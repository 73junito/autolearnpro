param(
  [int]$PRNumber = 6,
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro'
)

# Get token from env or prompt
$token = $env:GITHUB_TOKEN
if (-not $token) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT with repo permissions"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $token = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$headers = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }
$uri = "https://api.github.com/repos/$Owner/$Repo/pulls/$PRNumber/merge"
$body = @{ commit_title = "Merge PR #$PRNumber (automated)"; commit_message = "Automated merge of PR #$PRNumber"; merge_method = "merge" } | ConvertTo-Json

Write-Output "Attempting to merge PR #$PRNumber on $Owner/$Repo..."
try {
  $res = Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body -ErrorAction Stop
  Write-Output "Merge response: $($res | ConvertTo-Json -Depth 6)"
  if ($res.merged -eq $true) {
    Write-Output "PR #$PRNumber merged successfully."
    exit 0
  } else {
    Write-Output "Merge not performed: $($res.message)"
    exit 2
  }
} catch {
  Write-Error "Merge failed: $($_.Exception.Message)"
  if ($_.Exception.Response -ne $null) {
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $bodyText = $reader.ReadToEnd()
      Write-Error $bodyText
    } catch {}
  }
  exit 3
}
