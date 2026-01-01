$secure = Read-Host -AsSecureString "Enter GitHub PAT (for repo update and dispatch)"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pat = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
try {
  $owner = '73junito'
  $repo  = 'autolearnpro'
  $path  = '.github/workflows/publish-image.yml'
  $branch = 'main'

  Write-Output "Reading local workflow file $path..."
  $content = Get-Content -Raw -Path $path -ErrorAction Stop
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))

  $headers = @{
    Authorization = "token $pat"
    Accept        = 'application/vnd.github+json'
    'User-Agent'  = 'autolearnpro-agent'
  }

  $uri = "https://api.github.com/repos/$owner/$repo/contents/$path?ref=$branch"
  try {
    $resp = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction Stop
    $sha = $resp.sha
    Write-Output "Found existing file on $branch with sha $sha"
  } catch {
    Write-Output "File not found on $branch, will create new file."
    $sha = $null
  }

  $body = @{
    message   = "ci: fix Dockerfile path for buildx (context-relative)"
    committer = @{ name='Automation'; email='noreply@example.com' }
    content   = $b64
    branch    = $branch
  }
  if ($sha) { $body.sha = $sha }

  $json = $body | ConvertTo-Json -Depth 6
  $updateUri = "https://api.github.com/repos/$owner/$repo/contents/$path"
  Write-Output "Updating $path on branch $branch..."
  $putResp = Invoke-RestMethod -Method Put -Uri $updateUri -Headers $headers -Body $json -ErrorAction Stop
  Write-Output "Updated file on branch $branch. Commit: $($putResp.commit.sha)"

  # Dispatch the workflow
  $wf = 'publish-image.yml'
  $dispatchUri = "https://api.github.com/repos/$owner/$repo/actions/workflows/$wf/dispatches"
  $dispatchBody = @{ ref = $branch } | ConvertTo-Json
  Write-Output "Dispatching workflow $wf on $branch..."
  Invoke-RestMethod -Method Post -Uri $dispatchUri -Headers $headers -Body $dispatchBody -ErrorAction Stop
  Write-Output "Workflow dispatch requested. Waiting for run to appear..."

  Start-Sleep -Seconds 3
  $runId = $null
  for ($i=0; $i -lt 40; $i++) {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/workflows/$wf/runs?per_page=10" -Headers $headers
    foreach ($r in $runs.workflow_runs) { if ($r.head_branch -eq $branch) { $runId = $r.id; break } }
    if ($runId) { break }
    Start-Sleep -Seconds 5
  }

  if (-not $runId) {
    Write-Output "Could not find a run; recent runs:"
    $runs.workflow_runs | Select-Object id, head_branch, status, conclusion, html_url | Format-Table
    exit 1
  }

  $runUrl = "https://github.com/$owner/$repo/actions/runs/$runId"
  Write-Output "Found run id ${runId}: $runUrl"

  while ($true) {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs/$runId" -Headers $headers
    Write-Output "Run status: $($r.status) - conclusion: $($r.conclusion)"
    if ($r.status -eq 'completed') { break }
    Start-Sleep -Seconds 10
  }

  if ($r.conclusion -eq 'success') {
    Write-Output "Workflow succeeded: $runUrl"
  } else {
    Write-Output "Workflow finished with conclusion: $($r.conclusion); downloading logs..."
    $logsUrl = "https://api.github.com/repos/$owner/$repo/actions/runs/$runId/logs"
    $zipPath = Join-Path $PWD "actions-$runId-logs.zip"
    Invoke-WebRequest -Uri $logsUrl -Headers $headers -OutFile $zipPath -ErrorAction Stop
    $extractDir = Join-Path $PWD "actions-$runId-logs"
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
    Write-Output "Downloaded and extracted logs to $extractDir"
  }
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
