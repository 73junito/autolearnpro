param(
  [string]$Branch = 'add/dockerfile-20251215135348',
  [string]$Owner = '73junito',
  [string]$Repo = 'autolearnpro',
  [string]$WorkflowFile = 'publish-image.yml',
  [switch]$DryRun
)

# Prompt for PAT unless DryRun
if (-not $DryRun) {
  $secure = Read-Host -AsSecureString "Enter GitHub PAT (repo, workflow)"
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} else { $pat = '' }
try {
  $headers = @{ Authorization = "token $pat"; Accept = 'application/vnd.github+json'; 'User-Agent'='autolearnpro-agent' }
  $dispatchUri = "https://api.github.com/repos/$Owner/$Repo/actions/workflows/$WorkflowFile/dispatches"
  $dispatchBody = @{ ref = $Branch } | ConvertTo-Json
  Write-Output "Dispatching workflow $WorkflowFile on branch $Branch..."
  if ($DryRun) { Write-Output "DRYRUN: POST $dispatchUri (body length: $($dispatchBody.Length))"; Write-Output 'DRYRUN: Dispatch requested.' } else { Invoke-RestMethod -Method Post -Uri $dispatchUri -Headers $headers -Body $dispatchBody -ErrorAction Stop; Write-Output 'Dispatch requested.' }
} finally {
  if (-not $DryRun) { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
